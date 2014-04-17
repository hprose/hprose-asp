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
 * hproseHttpServer.js                                    *
 *                                                        *
 * hprose http server library for ASP.                    *
 *                                                        *
 * LastModified: Mar 23, 2014                             *
 * Author: Ma Bingyao <andot@hprose.com>                  *
 *                                                        *
\**********************************************************/

/*global HproseUtil */
/*global HproseResultMode */
/*global HproseException */
/*global HproseStringInputStream */
/*global HproseStringOutputStream */
/*global HproseReader */
/*global HproseWriter */
/*global HproseTags */
/*global Request */
/*global Response */
/*global Session */
/*jshint es3:true, evil:true, strict:false, unused:false, eqeqeq:true, notypeof:true */
var HproseHttpServer = (function() {
    function callService(method, obj, context, args) {
        var result;
        if (typeof(method) === "function") {
            result = method.apply(context, args);
        }
        else if (obj && typeof(obj[method]) === "function") {
            result = obj[method].apply(context, args);
        }
        else {
            var a = [];
            for (var i = 0, n = args.length; i < n; i++) {
                a[i] = "args[" + i + "]";
            }
            if (obj === null) {
                if (typeof(method) === "string") {
                    result = eval(method + "(" + a.join(", ") + ")");
                }
                else {
                    result = eval("method(" + a.join(", ") + ")");
                }
            }
            else {
                result = eval("obj[method](" + a.join(", ") + ")");
            }
        }
        return result;
    }
    return (function() {
        /* Reference of global Class */
        var HResultMode = HproseResultMode;
        var HException = HproseException;
        var HUtil = HproseUtil;
        var HStringInputStream = HproseStringInputStream;
        var HStringOutputStream = HproseStringOutputStream;
        var HReader = HproseReader;
        var HWriter = HproseWriter;
        var HTags = HproseTags;
        function arrayValues(obj) {
            var result = [];
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    result[result.length] = obj[key];
                }
            }
            return result;
        }

        function getRefName(ref) {
            for (var name in ref) return name;
        }

        function getFuncName(func) {
            var f = func.toString();
            return f.substr(0, f.indexOf("(")).replace(/(^\s*function\s*)|(\s*$)/ig, "");
        }

        function HproseHttpServer(vbs) {
            var m_functions = {};
            var m_funcNames = {};
            var m_resultMode = {};
            var m_simpleMode = {};
            var m_debug = false;
            var m_crossDomain = false;
            var m_P3P = false;
            var m_get = true;
            var m_simple = false;
            var m_filters = [];
            var m_origins = {};
            var m_origincount = 0;
            var m_input;
            var m_output;
            this.onBeforeInvoke = null;
            this.onAfterInvoke = null;
            this.onSendHeader = null;
            this.onSendError = null;

            function constructor(service) {
                var count = Request.totalBytes;
                var bytes = Request.binaryRead(count);
                var data = "";
                if (count > 0) {
                    data = HUtil.binaryToString(bytes);
                }
                Session.CodePage = 65001;
                Response.CodePage = 65001;
                for (var i = m_filters.length - 1; i >= 0; i--) {
                    data = m_filters[i].inputFilter(data, service);
                }
                m_input = new HStringInputStream(data);
                m_output = new HStringOutputStream();
            }

            function sendHeader(service) {
                if (service.onSendHeader !== null) {
                    service.onSendHeader(service);
                }
                Response.addHeader("Content-Type", "text/plain");
                if (m_P3P) {
                    Response.addHeader("P3P",
                        "CP=\"CAO DSP COR CUR ADM DEV TAI PSA PSD IVAi IVDi " +
                        "CONi TELo OTPi OUR DELi SAMi OTRi UNRi PUBi IND PHY ONL " +
                        "UNI PUR FIN COM NAV INT DEM CNT STA POL HEA PRE GOV\"");
                }
                if (m_crossDomain) {
                    var origin = String(Request.ServerVariables("HTTP_ORIGIN"));
                    if (origin && origin !== "null") {
                        if (m_origincount === 0 || m_origins[origin]) {
                            Response.addHeader("Access-Control-Allow-Origin", origin);
                            Response.addHeader("Access-Control-Allow-Credentials", "true");
                        }
                    }
                    else {
                        Response.addHeader("Access-Control-Allow-Origin", "*");
                    }
                }
            }

            function sendError(service, error) {
                if (service.onSendError !== null) {
                    service.onSendError(error, service);
                }
                m_output.clear();
                m_output.write(HTags.TagError);
                var writer = new HWriter(m_output, true);
                writer.writeString(error);
                m_output.write(HTags.TagEnd);
            }

            function doInvoke(service) {
                var simpleReader = new HReader(m_input, true, vbs);
                var tag;
                do {
                    var name = simpleReader.readString();
                    var alias = name.toLowerCase();
                    var func, resultMode, simple;
                    if (alias in m_functions) {
                        func = m_functions[alias];
                        resultMode = m_resultMode[alias];
                        simple = m_simpleMode[alias];
                    }
                    else if ("*" in m_functions) {
                        func = m_functions["*"];
                        resultMode = m_resultMode["*"];
                        simple = m_simpleMode["*"];
                    }
                    else {
                        throw new HException("Can't find this function " + name + "().");
                    }
                    if (simple === undefined) simple = m_simple;
                    var writer = new HWriter(m_output, simple);
                    var args = [];
                    var byref = false;
                    tag = simpleReader.checkTags(HTags.TagList +
                                                 HTags.TagEnd +
                                                 HTags.TagCall);
                    if (tag === HTags.TagList) {
                        var reader = new HReader(m_input, false, vbs);
                        args = reader.readListWithoutTag();
                        if (vbs) args = HUtil.toJSArray(args);
                        tag = reader.checkTags(HTags.TagTrue +
                                               HTags.TagEnd +
                                               HTags.TagCall);
                        if (tag === HTags.TagTrue) {
                            byref = true;
                            tag = reader.checkTags(HTags.TagEnd +
                                                   HTags.TagCall);
                        }
                    }
                    if (service.onBeforeInvoke !== null) {
                        service.onBeforeInvoke(name, args, byref, service);
                    }
                    if (("*" in m_functions) && (func === m_functions["*"])) {
                        args = [name, args];
                    }
                    var result = callService(func.method, func.obj, func.context, args);
                    if (service.onAfterInvoke !== null) {
                        service.onAfterInvoke(name, args, byref, result, service);
                    }
                    if (resultMode === HResultMode.RawWithEndTag) {
                        m_output.write(result);
                        return;
                    }
                    else if (resultMode === HResultMode.Raw) {
                        m_output.write(result);
                    }
                    else {
                        m_output.write(HTags.TagResult);
                        if (resultMode === HResultMode.Serialized) {
                            m_output.write(result);
                        }
                        else {
                            writer.reset();
                            writer.serialize(result);
                        }
                        if (byref) {
                            m_output.write(HTags.TagArgument);
                            writer.reset();
                            writer.writeList(args);
                        }
                    }
                } while (tag === HTags.TagCall);
                m_output.write(HTags.TagEnd);
            }

            function doFunctionList() {
                var functions = arrayValues(m_funcNames);
                var writer = new HWriter(m_output, true);
                m_output.write(HTags.TagFunctions);
                writer.writeList(functions);
                m_output.write(HTags.TagEnd);
            }

            function handle(service) {
                try {
                    var tag = m_input.getc();
                    switch (tag) {
                        case HTags.TagCall: doInvoke(service); break;
                        case HTags.TagEnd: doFunctionList(); break;
                        default: throw new HException("Wrong Request: \r\n" . m_input.rawData());
                    }
                }
                catch (e) {
                    if (m_debug) {
                        sendError(service, "Error Name: " + e.name + "\r\n" +
                                           "Error Code: " + e.number + "\r\n" +
                                           "Error Message: " + e.message);
                    }
                    else {
                        sendError(service, e.description);
                    }
                }
            }

            this.addMissingFunction = function(func, resultMode, simple) {
                this.addFunction(func, "*", resultMode, simple);
            };

            this.addMissingMethod = function(method, obj, context, resultMode, simple) {
                this.addMethod(method, obj, "*", context, resultMode, simple);
            };

            this.addFunction = function(func, alias, resultMode, simple) {
                if (resultMode === undefined) {
                    resultMode = HResultMode.Normal;
                }
                if (alias === undefined || alias === null) {
                    switch(typeof(func)) {
                        case "string":
                            alias = func;
                            break;
                        case "object":
                            alias = getRefName(func);
                            break;
                        case "function":
                            alias = getFuncName(func);
                            if (alias !== "") break;
                            throw new HException("Need an alias");
                        default:
                            throw new HException("Need an alias");
                    }
                }
                if (typeof(alias) === "string") {
                    var aliasName = alias.toLowerCase();
                    m_functions[aliasName] = {method: func, obj: null, context: null};
                    m_funcNames[aliasName] = alias;
                    m_resultMode[aliasName] = resultMode;
                    m_simpleMode[aliasName] = simple;
                }
                else {
                    throw new HException("Argument alias is not a string");
                }
            };

            this.addFunctions = function(functions, aliases, resultMode, simple) {
                if (HUtil.isVBArray(functions)) {
                    functions = HUtil.toJSArray(functions);
                }
                var count = functions.length;
                var i;
                if (aliases === undefined || aliases === null) {
                    for (i = 0; i < count; i++) this.addFunction(functions[i], null, resultMode, simple);
                    return;
                }
                else if (HUtil.isVBArray(aliases)) {
                    aliases = HUtil.toJSArray(aliases);
                }
                if (count !== aliases.length) {
                    throw new HException("The count of functions is not matched with aliases");
                }
                for (i = 0; i < count; i++) this.addFunction(functions[i], aliases[i], resultMode, simple);
            };

            this.addMethod = function(method, obj, alias, context, resultMode, simple) {
                if (obj === undefined || obj === null) {
                    this.addFunction(method, alias, resultMode, simple);
                    return;
                }
                if (context === undefined) {
                    context = obj;
                }
                if (resultMode === undefined) {
                    resultMode = HResultMode.Normal;
                }
                if (alias === undefined || alias === null) {
                    switch(typeof(method)) {
                        case "string":
                            alias = method;
                            break;
                        case "object":
                            alias = getRefName(method);
                            break;
                        case "function":
                            alias = getFuncName(method);
                            if (alias !== "") break;
                            throw new HException("Need an alias");
                        default:
                            throw new HException("Need an alias");
                    }
                }
                if (typeof(alias) === "string") {
                    var aliasName = alias.toLowerCase();
                    m_functions[aliasName] = {method: method, obj: obj, context: context};
                    m_funcNames[aliasName] = alias;
                    m_resultMode[aliasName] = resultMode;
                    m_simpleMode[aliasName] = simple;
                }
                else {
                    throw new HException("Argument alias is not a string");
                }
            };

            this.addMethods = function(methods, obj, aliases, context, resultMode, simple) {
                if (HUtil.isVBArray(methods)) {
                    methods = HUtil.toJSArray(methods);
                }
                var count = methods.length;
                var i;
                if (aliases === undefined || aliases === null) {
                    for (i = 0; i < count; i++) {
                        this.addMethod(methods[i], obj, null, context, resultMode, simple);
                    }
                    return;
                }
                else if (HUtil.isVBArray(aliases)) {
                    aliases = HUtil.toJSArray(aliases);
                }
                if (count !== aliases.length) {
                    throw new HException("The count of methods is not matched with aliases");
                }
                for (i = 0; i < count; i++) {
                    this.addMethod(methods[i], obj, aliases[i], context, resultMode, simple);
                }
            };

            this.addInstanceMethods = function(obj, aliasPrefix, context, resultMode, simple) {
                var alias;
                for (var name in obj) {
                    if (obj.hasOwnProperty(name)) {
                        alias = (aliasPrefix ? aliasPrefix + "_" + name : name);
                        if (typeof(obj[name]) === "function") {
                            this.addMethod(obj[name], obj, alias, context, resultMode, simple);
                        }
                        else if (typeof(obj[name]) === "unknown") {
                            this.addFunction(obj[name], alias, resultMode, simple);
                        }
                    }
                }
            };

            this.isDebugEnabled = function() {
                return m_debug;
            };
            this.setDebugEnabled = function(enable) {
                if (enable === undefined) enable = true;
                m_debug = enable;
            };
            this.isCrossDomainEnabled = function() {
                return m_crossDomain;
            };
            this.setCrossDomainEnabled = function(enable) {
                if (enable === undefined) enable = true;
                m_crossDomain = enable;
            };
            this.isP3PEnabled = function() {
                return m_P3P;
            };
            this.setP3PEnabled = function(enable) {
                if (enable === undefined) enable = true;
                m_P3P = enable;
            };
            this.isGetEnabled = function() {
                return m_get;
            };
            this.setGetEnabled = function(enable) {
                if (enable === undefined) enable = true;
                m_get = enable;
            };
            this.getSimpleMode = function() {
                return m_simple;
            };
            this.setSimpleMode = function(value) {
                if (value === undefined) value = true;
                m_simple = value;
            };
            this.getFilter = function () {
                if (m_filters.length === 0) {
                    return null;
                }
                return m_filters[0];
            };
            this.setFilter = function (filter) {
                m_filters.length = 0;
                if (filter !== undefined && filter !== null) {
                    m_filters.push(filter);
                }
            };
            this.addFilter = function (filter) {
                m_filters.push(filter);
            };
            this.removeFilter = function (filter) {
                var i = m_filters.indexOf(filter);
                if (i === -1) {
                    return false;
                }
                m_filters.splice(i, 1);
                return true;
            };
            this.addAccessControlAllowOrigin = function (origin) {
                if (!m_origins[origin]) {
                    m_origins[origin] = true;
                    m_origincount++;
                }
            }
            this.removeAccessControlAllowOrigin = function (origin) {
                if (m_origins[origin]) {
                    delete m_origins[origin];
                    m_origincount++;
                }
            }
            this.handle = function() {
                Response.clear();
                Response.Buffer = false;
                sendHeader(this);
                if ((String(Request.ServerVariables("REQUEST_METHOD")) === "GET") && m_get) {
                    doFunctionList();
                }
                else if (String(Request.ServerVariables("REQUEST_METHOD")) === "POST") {
                    handle(this);
                }
                var data = m_output.toString();
                for (var i = 0, n = m_filters.length; i < n; i++) {
                    data = m_filters[i].outputFilter(data, this);
                }
                Response.write(data);
                Response.end();
            };
            this.start = this.handle;
            constructor(this);
        }
        HproseHttpServer.create = function() {
            return new HproseHttpServer(true);
        };
        return HproseHttpServer;
    })();
})();