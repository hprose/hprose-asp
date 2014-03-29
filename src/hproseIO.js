/**********************************************************\
|                                                          |
|                          hprose                          |
|                                                          |
| Official WebSite: http://www.hprose.com/                 |
|                   http://www.hprose.net/                 |
|                   http://www.hprose.org/                 |
|                                                          |
\**********************************************************/

/**********************************************************\
 *                                                        *
 * hproseIO.js                                            *
 *                                                        *
 * hprose io stream library for JavaScript.               *
 *                                                        *
 * LastModified: Mar 29, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*jshint es3:true, evil:true, strict:false, unused:false, strict:false, eqeqeq:true, notypeof:true */
/*global ActiveXObject, VBArray, HproseException, HproseUtil */

function HproseStringInputStream(str) {
    var pos = 0;
    var length = str.length;
    this.getc = function() {
        return str.charAt(pos++);
    };
    this.read = function(len) {
        var s = str.substr(pos, len);
        this.skip(len);
        return s;
    };
    this.skip = function(n) {
        pos += n;
    };
    this.readuntil = function(tag) {
        var p = str.indexOf(tag, pos);
        var s;
        if (p !== -1) {
            s = str.substr(pos, p - pos);
            pos = p + tag.length;
        }
        else {
            s = str.substr(pos);
            pos = length;
        }
        return s;
    };
    this.rawData = function() {
        return str;
    };
}

function HproseStringOutputStream(str) {
    if (str === undefined) str = '';
    var buf = [str];
    var size = buf.length;
    this.write = function(s) {
        buf[size++] = s;
    };
    this.mark = function() {
        str = this.toString();
    };
    this.reset = function() {
        buf = [str];
    };
    this.clear = function() {
        buf = [];
    };
    this.toString = function() {
        return buf.join('');
    };
}

var HproseTags = {
    /* Serialize Tags */
    TagInteger: 'i',
    TagLong: 'l',
    TagDouble: 'd',
    TagNull: 'n',
    TagEmpty: 'e',
    TagTrue: 't',
    TagFalse: 'f',
    TagNaN: 'N',
    TagInfinity: 'I',
    TagDate: 'D',
    TagTime: 'T',
    TagUTC: 'Z',
/*  TagBytes: 'b', */ // Not support bytes in JavaScript.
    TagUTF8Char: 'u',
    TagString: 's',
    TagGuid: 'g',
    TagList: 'a',
    TagMap: 'm',
    TagClass: 'c',
    TagObject: 'o',
    TagRef: 'r',
    /* Serialize Marks */
    TagPos: '+',
    TagNeg: '-',
    TagSemicolon: ';',
    TagOpenbrace: '{',
    TagClosebrace: '}',
    TagQuote: '"',
    TagPoint: '.',
    /* Protocol Tags */
    TagFunctions: 'F',
    TagCall: 'C',
    TagResult: 'R',
    TagArgument: 'A',
    TagError: 'E',
    TagEnd: 'z'
};

var HproseClassManager = (function() {
    var classCache = {};
    var aliasCache = new ActiveXObject('Scripting.Dictionary');
    var cm = {
        register: function(cls, alias) {
            aliasCache.Item(cls) = alias;
            classCache[alias] = cls;
        },
        getClassAlias: function(cls) {
            return aliasCache.Item(cls);
        },
        getClass: function(alias) {
            return classCache[alias];
        }
    };
    cm.register(Object, 'Object');
    return cm;
})();

var HproseRawReader, HproseReader, HproseWriter;
(function() {
    // Why I put freeEval here?
    // Because code compression will not work properly with eval.
    function freeEval(str) {
        return eval(str);
    }

    (function() {
        // private static members
        var HUtil = HproseUtil;
        var HTags = HproseTags;
        var HException = HproseException;
        var HClassManager = HproseClassManager;
        function findClass(cn, poslist, i, c) {
            if (i < poslist.length) {
                var pos = poslist[i];
                cn[pos] = c;
                var cls = findClass(cn, poslist, i + 1, '.');
                if (i + 1 < poslist.length) {
                    if (cls === null) {
                        cls = findClass(cn, poslist, i + 1, '_');
                    }
                }
                return cls;
            }
            var classname = cn.join('');
            try {
                if (freeEval('typeof(' + classname + ') === "function"')) {
                    return freeEval(classname);
                }
                else {
                    return null;
                }
            }
            catch(e) {
                return null;
            }
        }
        function getClass(classname) {
            var cls = HClassManager.getClass(classname);
            if (cls) return cls;
            if (freeEval('typeof(' + classname + ') === "function"')) {
                cls = freeEval(classname);
                HClassManager.register(cls, classname);
                return cls;
            }
            var poslist = [];
            var pos = classname.indexOf('_');
            while (pos > -1) {
                poslist[poslist.length] = pos;
                pos = classname.indexOf('_', pos + 1);
            }
            if (poslist.length > 0) {
                var cn = classname.split('');
                cls = findClass(cn, poslist, 0, '.');
                if (cls === null) {
                    cls = findClass(cn, poslist, 0, '_');
                }
                if (cls !== null) {
                    HClassManager.register(cls, classname);
                    return cls;
                }
            }
            cls = function() {
                this.getClassName = function() {
                    return classname;
                };
            };
            HClassManager.register(cls, classname);
            return cls;
        }
        function isNegZero(value) {
            return (value === 0 && 1/value === -Infinity);
        }
        function isArray(value) {
            return (Object.prototype.toString.apply(value) === '[object Array]');
        }
        function getClassName(obj) {
            if (obj === undefined || obj.constructor === undefined) return 'Object';
            var cls = obj.constructor;
            var classname = HClassManager.getClassAlias(cls);
            if (classname) return classname;
            var ctor = cls.toString();
            classname = ctor.substr(0, ctor.indexOf('(')).replace(/(^\s*function\s*)|(\s*$)/ig, '');
            if (classname === '' || classname === 'Object') {
                return (typeof(obj.getClassName) === 'function') ? obj.getClassName() : 'Object';
            }
            if (classname !== 'Object') {
                HClassManager.register(cls, classname);
            }
            return classname;
        }
        function unexpectedTag(tag, expectTags) {
            if (tag && expectTags) {
                throw new HException('Tag "' + expectTags + '" expected, but "' + tag + '" found in stream');
            }
            if (tag) {
                throw new HException('Unexpected serialize tag "' + tag + '" in stream');
            }
            throw new HException('No byte found in stream');
        }
        // public class
        HproseRawReader = function hproseRawReader(stream) {
            function readRaw(ostream, tag) {
                if (ostream === undefined) ostream = new HproseStringOutputStream();
                if (tag === undefined) tag = stream.getc();
                ostream.write(tag);
                switch (tag) {
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                case HproseTags.TagNull:
                case HproseTags.TagEmpty:
                case HproseTags.TagTrue:
                case HproseTags.TagFalse:
                case HproseTags.TagNaN:
                    break;
                case HproseTags.TagInfinity:
                case HproseTags.TagUTF8Char:
                    ostream.write(stream.getc());
                    break;
                case HproseTags.TagInteger:
                case HproseTags.TagLong:
                case HproseTags.TagDouble:
                case HproseTags.TagRef:
                    readNumberRaw(ostream);
                    break;
                case HproseTags.TagDate:
                case HproseTags.TagTime:
                    readDateTimeRaw(ostream);
                    break;
                case HproseTags.TagString:
                    readStringRaw(ostream);
                    break;
                case HproseTags.TagGuid:
                    readGuidRaw(ostream);
                    break;
                case HproseTags.TagList:
                case HproseTags.TagMap:
                case HproseTags.TagObject:
                    readComplexRaw(ostream);
                    break;
                case HproseTags.TagClass:
                    readComplexRaw(ostream);
                    readRaw(ostream);
                    break;
                case HproseTags.TagError:
                    readRaw(ostream);
                    break;
                default:
                    unexpectedTag(tag);
                }
                return ostream;
            }
            function readNumberRaw(ostream) {
                var tag;
                do {
                    tag = stream.getc();
                    ostream.write(tag);
                } while (tag !== HproseTags.TagSemicolon);
            }
            function readDateTimeRaw(ostream) {
                var tag;
                do {
                    tag = stream.getc();
                    ostream.write(tag);
                } while (tag !== HproseTags.TagSemicolon &&
                         tag !== HproseTags.TagUTC);
            }
            function readStringRaw(ostream) {
                var s = stream.readuntil(HproseTags.TagQuote);
                ostream.write(s);
                ostream.write(HproseTags.TagQuote);
                var len = 0;
                if (s.length > 0) len = parseInt(s, 10);
                ostream.write(stream.read(len + 1));
            }
            function readGuidRaw(ostream) {
                ostream.write(stream.read(38));
            }
            function readComplexRaw(ostream) {
                var tag;
                do {
                    tag = stream.getc();
                    ostream.write(tag);
                } while (tag !== HproseTags.TagOpenbrace);
                while ((tag = stream.getc()) !== HproseTags.TagClosebrace) {
                    readRaw(ostream, tag);
                }
                ostream.write(tag);
            }
            this.readRaw = readRaw;
        };

        var fakeReaderRefer = {
            set: function (val) {},
            read: function (index) {
                unexpectedTag(HTags.TagRef);
            },
            reset: function () {}
        };

        function realReaderRefer() {
            var ref = [];
            return {
                set: function (val) {
                    ref[ref.length] = val;
                },
                read: function (index) {
                    return ref[index];
                },
                reset: function () {
                    ref.length = 0;
                }
            };
        }

        // public class
        HproseReader = function hproseReader(stream, simple, vbs) {
            HproseRawReader.call(this, stream);
            var classref = [];
            var refer = (simple ? fakeReaderRefer : realReaderRefer());
            function checkTag(expectTag, tag) {
                if (tag === undefined) tag = stream.getc();
                if (tag !== expectTag) unexpectedTag(tag, expectTag);
            }
            function checkTags(expectTags, tag) {
                if (tag === undefined) tag = stream.getc();
                if (expectTags.indexOf(tag) >= 0) return tag;
                unexpectedTag(tag, expectTags);
            }
            function readInt(tag) {
                var s = stream.readuntil(tag);
                if (s.length === 0) return 0;
                return parseInt(s, 10);
            }
            function unserialize() {
                var tag = stream.getc();
                switch (tag) {
                case '0': return 0;
                case '1': return 1;
                case '2': return 2;
                case '3': return 3;
                case '4': return 4;
                case '5': return 5;
                case '6': return 6;
                case '7': return 7;
                case '8': return 8;
                case '9': return 9;
                case HTags.TagInteger: return readIntegerWithoutTag();
                case HTags.TagLong: return readLongWithoutTag();
                case HTags.TagDouble: return readDoubleWithoutTag();
                case HTags.TagNull: return null;
                case HTags.TagEmpty: return '';
                case HTags.TagTrue: return true;
                case HTags.TagFalse: return false;
                case HTags.TagNaN: return NaN;
                case HTags.TagInfinity: return readInfinityWithoutTag();
                case HTags.TagDate: return readDateWithoutTag();
                case HTags.TagTime: return readTimeWithoutTag();
                case HTags.TagUTF8Char: return stream.getc();
                case HTags.TagString: return readStringWithoutTag();
                case HTags.TagGuid: return readGuidWithoutTag();
                case HTags.TagList: return readListWithoutTag();
                case HTags.TagMap: return readMapWithoutTag();
                case HTags.TagClass: readClass(); return readObject();
                case HTags.TagObject: return readObjectWithoutTag();
                case HTags.TagRef: return readRef();
                case HTags.TagError: throw new HException(readString());
                default: unexpectedTag(tag);
                }
            }
            function readIntegerWithoutTag() {
                return readInt(HTags.TagSemicolon);
            }
            function readInteger() {
                var tag = stream.getc();
                switch (tag) {
                case '0': return 0;
                case '1': return 1;
                case '2': return 2;
                case '3': return 3;
                case '4': return 4;
                case '5': return 5;
                case '6': return 6;
                case '7': return 7;
                case '8': return 8;
                case '9': return 9;
                case HTags.TagInteger: return readIntegerWithoutTag();
                default: unexpectedTag(tag);
                }
            }
            function readLongWithoutTag() {
                var s = stream.readuntil(HTags.TagSemicolon);
                var l = parseInt(s, 10);
                if (l.toString() === s) return l;
                return s;
            }
            function readLong() {
                var tag = stream.getc();
                switch (tag) {
                case '0': return 0;
                case '1': return 1;
                case '2': return 2;
                case '3': return 3;
                case '4': return 4;
                case '5': return 5;
                case '6': return 6;
                case '7': return 7;
                case '8': return 8;
                case '9': return 9;
                case HTags.TagInteger:
                case HTags.TagLong: return readLongWithoutTag();
                default: unexpectedTag(tag);
                }
            }
            function readDoubleWithoutTag() {
                return parseFloat(stream.readuntil(HTags.TagSemicolon));
            }
            function readDouble() {
                var tag = stream.getc();
                switch (tag) {
                case '0': return 0;
                case '1': return 1;
                case '2': return 2;
                case '3': return 3;
                case '4': return 4;
                case '5': return 5;
                case '6': return 6;
                case '7': return 7;
                case '8': return 8;
                case '9': return 9;
                case HTags.TagInteger:
                case HTags.TagLong:
                case HTags.TagDouble: return readDoubleWithoutTag();
                case HTags.TagNaN: return NaN;
                case HTags.TagInfinity: return readInfinityWithoutTag();
                default: unexpectedTag(tag);
                }
            }
            function readInfinityWithoutTag() {
                return ((stream.getc() === HTags.TagNeg) ? -Infinity : Infinity);
            }
            function readBoolean() {
                var tag = stream.getc();
                switch (tag) {
                case HTags.TagTrue: return true;
                case HTags.TagFalse: return false;
                default: unexpectedTag(tag);
                }
            }
            function readDateWithoutTag() {
                var year = parseInt(stream.read(4), 10);
                var month = parseInt(stream.read(2), 10) - 1;
                var day = parseInt(stream.read(2), 10);
                var date;
                var tag = stream.getc();
                if (tag === HTags.TagTime) {
                    var hour = parseInt(stream.read(2), 10);
                    var minute = parseInt(stream.read(2), 10);
                    var second = parseInt(stream.read(2), 10);
                    var millisecond = 0;
                    tag = stream.getc();
                    if (tag === HTags.TagPoint) {
                        millisecond = parseInt(stream.read(3), 10);
                        tag = stream.getc();
                        if ((tag >= '0') && (tag <= '9')) {
                            stream.skip(2);
                            tag = stream.getc();
                            if ((tag >= '0') && (tag <= '9')) {
                                stream.skip(2);
                                tag = stream.getc();
                            }
                        }
                    }
                    if (tag === HTags.TagUTC) {
                        date = new Date(Date.UTC(year, month, day, hour, minute, second, millisecond));
                    }
                    else {
                        date = new Date(year, month, day, hour, minute, second, millisecond);
                    }
                }
                else if (tag === HTags.TagUTC) {
                    date = new Date(Date.UTC(year, month, day));
                }
                else {
                    date = new Date(year, month, day);
                }
                if (vbs) date = date.getVarDate();
                refer.set(date);
                return date;
            }
            function readDate() {
                var tag = stream.getc();
                switch (tag) {
                case HTags.TagNull: return null;
                case HTags.TagDate: return readDateWithoutTag();
                case HTags.TagRef: return readRef();
                default: unexpectedTag(tag);
                }
            }
            function readTimeWithoutTag() {
                var time;
                var hour = parseInt(stream.read(2), 10);
                var minute = parseInt(stream.read(2), 10);
                var second = parseInt(stream.read(2), 10);
                var millisecond = 0;
                var tag = stream.getc();
                if (tag === HTags.TagPoint) {
                    millisecond = parseInt(stream.read(3), 10);
                    tag = stream.getc();
                    if ((tag >= '0') && (tag <= '9')) {
                        stream.skip(2);
                        tag = stream.getc();
                        if ((tag >= '0') && (tag <= '9')) {
                            stream.skip(2);
                            tag = stream.getc();
                        }
                    }
                }
                if (tag === HTags.TagUTC) {
                    time = new Date(Date.UTC(1970, 0, 1, hour, minute, second, millisecond));
                }
                else {
                    time = new Date(1970, 0, 1, hour, minute, second, millisecond);
                }
                if (vbs) time = time.getVarDate();
                refer.set(time);
                return time;
            }
            function readTime() {
                var tag = stream.getc();
                switch (tag) {
                case HTags.TagNull: return null;
                case HTags.TagTime: return readTimeWithoutTag();
                case HTags.TagRef: return readRef();
                default: unexpectedTag(tag);
                }
            }
            function _readString() {
                var s = stream.read(readInt(HTags.TagQuote));
                stream.skip(1);
                return s;
            }
            function readStringWithoutTag() {
                var s = _readString();
                refer.set(s);
                return s;
            }
            function readString() {
                var tag = stream.getc();
                switch (tag) {
                case HTags.TagNull: return null;
                case HTags.TagEmpty: return '';
                case HTags.TagUTF8Char: return stream.getc();
                case HTags.TagString: return readStringWithoutTag();
                case HTags.TagRef: return readRef();
                default: unexpectedTag(tag);
                }
            }
            function readGuidWithoutTag() {
                stream.skip(1);
                var s = stream.read(36);
                stream.skip(1);
                refer.set(s);
                return s;
            }
            function readGuid() {
                var tag = stream.getc();
                switch (tag) {
                case HTags.TagNull: return null;
                case HTags.TagGuid: return readGuidWithoutTag();
                case HTags.TagRef: return readRef();
                default: unexpectedTag(tag);
                }
            }
            function readListWithoutTag() {
                var list = [];
                refer.set(list);
                var count = readInt(HTags.TagOpenbrace);
                for (var i = 0; i < count; i++) {
                    list[i] = unserialize();
                }
                stream.skip(1);
                if (vbs) list = HUtil.toVBArray(list);
                return list;
            }
            function readList() {
                var tag = stream.getc();
                switch (tag) {
                case HTags.TagNull: return null;
                case HTags.TagList: return readListWithoutTag();
                case HTags.TagRef: return readRef();
                default: unexpectedTag(tag);
                }
            }
            function readMapWithoutTag() {
                var map = (vbs ? new ActiveXObject('Scripting.Dictionary') : {});
                refer.set(map);
                var count = readInt(HTags.TagOpenbrace);
                for (var i = 0; i < count; i++) {
                    var key = unserialize();
                    var value = unserialize();
                    if (vbs) {
                        map.Add(key, value);
                    }
                    else {
                        map[key] = value;
                    }
                }
                stream.skip(1);
                return map;
            }
            function readMap() {
                var tag = stream.getc();
                switch (tag) {
                case HTags.TagNull: return null;
                case HTags.TagMap: return readMapWithoutTag();
                case HTags.TagRef: return readRef();
                default: unexpectedTag(tag);
                }
            }
            function readObjectWithoutTag() {
                var cls = classref[readInt(HTags.TagOpenbrace)];
                var obj = new cls.classname();
                refer.set(obj);
                for (var i = 0; i < cls.count; i++) {
                    obj[cls.fields[i]] = unserialize();
                }
                stream.skip(1);
                return obj;
            }
            function readObject() {
                var tag = stream.getc();
                switch(tag) {
                case HTags.TagNull: return null;
                case HTags.TagClass: readClass(); return readObject();
                case HTags.TagObject: return readObjectWithoutTag();
                case HTags.TagRef: return readRef();
                default: unexpectedTag(tag);
                }
            }
            function readClass() {
                var classname = _readString();
                var count = readInt(HTags.TagOpenbrace);
                var fields = [];
                for (var i = 0; i < count; i++) {
                    fields[i] = readString();
                }
                stream.skip(1);
                classname = getClass(classname);
                classref[classref.length] = {
                    classname: classname,
                    count: count,
                    fields: fields
                };
            }
            function readRef() {
                return refer.read(readInt(HTags.TagSemicolon));
            }
            function reset() {
                classref.length = 0;
                refer.reset();
            }
            this.checkTag = checkTag;
            this.checkTags = checkTags;
            this.unserialize = unserialize;
            this.readInteger = readInteger;
            this.readLong = readLong;
            this.readDouble = readDouble;
            this.readBoolean = readBoolean;
            this.readDateWithoutTag = readDateWithoutTag;
            this.readDate = readDate;
            this.readTimeWithoutTag = readTimeWithoutTag;
            this.readTime = readTime;
            this.readStringWithoutTag = readStringWithoutTag;
            this.readString = readString;
            this.readGuidWithoutTag = readGuidWithoutTag;
            this.readGuid = readGuid;
            this.readListWithoutTag = readListWithoutTag;
            this.readList = readList;
            this.readMapWithoutTag = readMapWithoutTag;
            this.readMap = readMap;
            this.readObjectWithoutTag = readObjectWithoutTag;
            this.readObject = readObject;
            this.reset = reset;
        };

        var fakeWriterRefer = {
            set: function () {},
            write: function () { return false; },
            reset: function () {}
        };

        var realWriterRefer = function (stream) {
            var ref = new ActiveXObject('Scripting.Dictionary');
            var refcount = 0;
            return {
                set: function (val) {
                    ref.Item(val) = refcount++;
                },
                write: function (val) {
                    if (ref.Exists(val)) {
                        stream.write(HTags.TagRef + ref.Item(val) + HTags.TagSemicolon);
                        return true;
                    }
                    return false;
                },
                reset: function () {
                    ref.RemoveAll();
                    refcount = 0;
                }
            };
        };

        // public class
        HproseWriter = function hproseWriter(stream, simple) {
            var classref = {};
            var fieldsref = [];
            var refer = (simple ? fakeWriterRefer : realWriterRefer(stream));
            function serialize(variable) {
                if (variable === undefined ||
                    variable === null ||
                    variable.constructor === Function) {
                    return writeNull();
                }
                if (variable === '') {
                    return writeEmpty();
                }
                if (typeof(variable) === 'date') {
                    return writeDate(new Date(variable));
                }
                if (HUtil.isDictionary(variable)) {
                    return writeDictWithRef(variable);
                }
                if (HUtil.isVBArray(variable)) {
                    variable = HUtil.toJSArray(variable);
                }
                switch (variable.constructor) {
                case Boolean:
                    writeBoolean(variable);
                    break;
                case Number:
                    writeNumber(variable);
                    break;
                case String:
                    if (variable.length === 1) {
                        writeUTF8Char(variable);
                    }
                    else {
                        writeStringWithRef(variable);
                    }
                    break;
                case Date:
                    writeDateWithRef(variable);
                    break;
                default:
                    if (isArray(variable)) {
                        writeListWithRef(variable);
                    }
                    else {
                        var classname = getClassName(variable);
                        if (classname === 'Object') {
                            writeMapWithRef(variable);
                        }
                        else {
                            writeObjectWithRef(variable);
                        }
                    }
                }
            }
            function writeNumber(n) {
                n = n.valueOf();
                if (isNegZero(n)) {
                    stream.write(HTags.TagInteger + '-0' + HTags.TagSemicolon);
                }
                else if (n === (n | 0)) {
                    if (0 <= n && n <= 9) {
                        stream.write('' + n);
                    }
                    else {
                        stream.write(HTags.TagInteger + n + HTags.TagSemicolon);
                    }
                }
                else {
                    writeDouble(n);
                }
            }
            function writeInteger(i) {
                if (0 <= i && i <= 9) {
                    stream.write('' + i);
                }
                else {
                    if (i < -2147483648 || i > 2147483647) {
                        stream.write(HTags.TagLong);
                    }
                    else {
                        stream.write(HTags.TagInteger);
                    }
                    stream.write('' + i + HTags.TagSemicolon);
                }
            }
            function writeDouble(d) {
                if (isNaN(d)) {
                    writeNaN();
                }
                else if (isFinite(d)) {
                    if (isNegZero(d)) {
                        d = '-0';
                    }
                    stream.write(HTags.TagDouble + d + HTags.TagSemicolon);
                }
                else {
                    writeInfinity(d > 0);
                }
            }
            function writeNaN() {
                stream.write(HTags.TagNaN);
            }
            function writeInfinity(positive) {
                stream.write(HTags.TagInfinity + (positive ?
                                                  HTags.TagPos :
                                                  HTags.TagNeg));
            }
            function writeNull() {
                stream.write(HTags.TagNull);
            }
            function writeEmpty() {
                stream.write(HTags.TagEmpty);
            }
            function writeBoolean(b) {
                stream.write(b.valueOf() ? HTags.TagTrue : HTags.TagFalse);
            }
            function writeUTCDate(date) {
                refer.set(date);
                var year = ('0000' + date.getUTCFullYear()).slice(-4);
                var month = ('00' + (date.getUTCMonth() + 1)).slice(-2);
                var day = ('00' + date.getUTCDate()).slice(-2);
                var hour = ('00' + date.getUTCHours()).slice(-2);
                var minute = ('00' + date.getUTCMinutes()).slice(-2);
                var second = ('00' + date.getUTCSeconds()).slice(-2);
                var millisecond = ('000' + date.getUTCMilliseconds()).slice(-3);
                stream.write(HTags.TagDate + year + month + day +
                             HTags.TagTime + hour + minute + second);
                if (millisecond !== '000') {
                    stream.write(HTags.TagPoint + millisecond);
                }
                stream.write(HTags.TagUTC);
            }
            function writeUTCDateWithRef(date) {
                if (!refer.write(date)) writeUTCDate(date);
            }
            function writeDate(date) {
                refer.set(date);
                var year = ('0000' + date.getFullYear()).slice(-4);
                var month = ('00' + (date.getMonth() + 1)).slice(-2);
                var day = ('00' + date.getDate()).slice(-2);
                var hour = ('00' + date.getHours()).slice(-2);
                var minute = ('00' + date.getMinutes()).slice(-2);
                var second = ('00' + date.getSeconds()).slice(-2);
                var millisecond = ('000' + date.getMilliseconds()).slice(-3);
                if ((hour === '00') && (minute === '00') &&
                    (second === '00') && (millisecond === '000')) {
                    stream.write(HTags.TagDate + year + month + day);
                }
                else if ((year === '1970') && (month === '01') && (day === '01')) {
                    stream.write(HTags.TagTime + hour + minute + second);
                    if (millisecond !== '000') {
                        stream.write(HTags.TagPoint + millisecond);
                    }
                }
                else {
                    stream.write(HTags.TagDate + year + month + day +
                                 HTags.TagTime + hour + minute + second);
                    if (millisecond !== '000') {
                        stream.write(HTags.TagPoint + millisecond);
                    }
                }
                stream.write(HTags.TagSemicolon);
            }
            function writeDateWithRef(date) {
                if (!refer.write(date)) writeDate(date);
            }
            function writeTime(time) {
                refer.set(time);
                var hour = ('00' + time.getHours()).slice(-2);
                var minute = ('00' + time.getMinutes()).slice(-2);
                var second = ('00' + time.getSeconds()).slice(-2);
                var millisecond = ('000' + time.getMilliseconds()).slice(-3);
                stream.write(HTags.TagTime + hour + minute + second);
                if (millisecond !== '000') {
                    stream.write(HTags.TagPoint + millisecond);
                }
                stream.write(HTags.TagSemicolon);
            }
            function writeTimeWithRef(time) {
                if (!refer.write(time)) writeTime(time);
            }
            function writeUTF8Char(c) {
                stream.write(HTags.TagUTF8Char + c);
            }
            function writeString(s) {
                refer.set(s);
                stream.write(HTags.TagString +
                    (s.length > 0 ? s.length : '') +
                    HTags.TagQuote + s + HTags.TagQuote);
            }
            function writeStringWithRef(str) {
                if (!refer.write(str)) writeString(str);
            }
            function writeList(list) {
                refer.set(list);
                var count = list.length;
                stream.write(HTags.TagList + (count > 0 ? count : '') + HTags.TagOpenbrace);
                for (var i = 0; i < count; i++) {
                    serialize(list[i]);
                }
                stream.write(HTags.TagClosebrace);
            }
            function writeListWithRef(list) {
                if (!refer.write(list)) writeList(list);
            }
            function writeDict(dict) {
                refer.set(dict);
                var fields = (new VBArray(dict.Keys())).toArray();
                var count = fields.length;
                stream.write(HTags.TagMap + (count > 0 ? count : '') + HTags.TagOpenbrace);
                for (var i = 0; i < count; i++) {
                    serialize(fields[i]);
                    serialize(dict.Item(fields[i]));
                }
                stream.write(HTags.TagClosebrace);
            }
            function writeDictWithRef(dict) {
                if (!refer.write(dict)) writeDict(dict);
            }
            function writeMap(map) {
                refer.set(map);
                var fields = [];
                for (var key in map) {
                    if (map.hasOwnProperty(key) &&
                        typeof(map[key]) !== 'function' &&
                        (typeof(map[key]) !== 'unknown' ||
                        HUtil.isVBArray(map[key]))) {
                        fields[fields.length] = key;
                    }
                }
                var count = fields.length;
                stream.write(HTags.TagMap + (count > 0 ? count : '') + HTags.TagOpenbrace);
                for (var i = 0; i < count; i++) {
                    serialize(fields[i]);
                    serialize(map[fields[i]]);
                }
                stream.write(HTags.TagClosebrace);
            }
            function writeMapWithRef(map) {
                if (!refer.write(map)) writeMap(map);
            }
            function writeObject(obj) {
                var classname = getClassName(obj);
                var index = classref[classname];
                var fields;
                if (index !== undefined) {
                    fields = fieldsref[index];
                }
                else {
                    fields = [];
                    for (var key in obj) {
                        if (obj.hasOwnProperty(key) &&
                            typeof(obj[key]) !== 'function') {
                            fields[fields.length] = key.toString();
                        }
                    }
                    index = writeClass(classname, fields);
                }
                stream.write(HTags.TagObject + index + HTags.TagOpenbrace);
                refer.set(obj);
                var count = fields.length;
                for (var i = 0; i < count; i++) {
                    serialize(obj[fields[i]]);
                }
                stream.write(HTags.TagClosebrace);
            }
            function writeObjectWithRef(obj) {
                if (!refer.write(obj)) writeObject(obj);
            }
            function writeClass(classname, fields) {
                var count = fields.length;
                stream.write(HTags.TagClass + classname.length +
                             HTags.TagQuote + classname + HTags.TagQuote +
                             (count > 0 ? count : '') + HTags.TagOpenbrace);
                for (var i = 0; i < count; i++) {
                    writeString(fields[i]);
                }
                stream.write(HTags.TagClosebrace);
                var index = fieldsref.length;
                classref[classname] = index;
                fieldsref[index] = fields;
                return index;
            }
            function reset() {
                classref = {};
                fieldsref.length = 0;
                refer.reset();
            }
            this.serialize = serialize;
            this.writeInteger = writeInteger;
            this.writeDouble = writeDouble;
            this.writeBoolean = writeBoolean;
            this.writeUTCDate = writeUTCDate;
            this.writeUTCDateWithRef = writeUTCDateWithRef;
            this.writeDate = writeDate;
            this.writeDateWithRef = writeDateWithRef;
            this.writeTime = writeTime;
            this.writeTimeWithRef = writeTimeWithRef;
            this.writeUTF8Char = writeUTF8Char;
            this.writeString = writeString;
            this.writeStringWithRef = writeStringWithRef;
            this.writeList = writeList;
            this.writeListWithRef = writeListWithRef;
            this.writeDict = writeDict;
            this.writeDictWithRef = writeDictWithRef;
            this.writeMap = writeMap;
            this.writeMapWithRef = writeMapWithRef;
            this.writeObject = writeObject;
            this.writeObjectWithRef = writeObjectWithRef;
            this.reset = reset;
        };
    })();
})();

var HproseFormatter = {
    serialize: function(variable, simple) {
        var stream = new HproseStringOutputStream();
        var hproseWriter = new HproseWriter(stream, simple);
        hproseWriter.serialize(variable);
        return stream.toString();
    },
    unserialize: function(variable_representation, simple, vbs) {
        var stream = new HproseStringInputStream(variable_representation);
        var hproseReader = new HproseReader(stream, simple, vbs);
        return hproseReader.unserialize();
    }
};
