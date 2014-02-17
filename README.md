# Hprose for ASP

>---
- **[Introduction](#introduction)**
- **[Usage](#usage)**
    - **[Server](#server)**
    - **[Client](#client)**

>---

## Introduction

*Hprose* is a High Performance Remote Object Service Engine.

It is a modern, lightweight, cross-language, cross-platform, object-oriented, high performance, remote dynamic communication middleware. It is not only easy to use, but powerful. You just need a little time to learn, then you can use it to easily construct cross language cross platform distributed application system.

*Hprose* supports many programming languages, for example:

* AAuto Quicker
* ActionScript
* ASP
* C++
* Dart
* Delphi/Free Pascal
* dotNET(C#, Visual Basic...)
* Golang
* Java
* JavaScript
* Node.js
* Objective-C
* Perl
* PHP
* Python
* Ruby
* ...

Through *Hprose*, You can conveniently and efficiently intercommunicate between those programming languages.

This project is the implementation of Hprose for ASP.

## Usage

You don't need use the JScript source files. You only need include `hprose-asp.js` in your asp files. You can use VBScript or JScript to write the hprose server and client.

### Server

Using it in VBScript like this:

```html
<%@ CODEPAGE=65001 %>
<script runat="server" language="JScript" src="hprose/hprose-asp.js"></script>
<%
    Function hello(name)
    hello = "Hello " & name & "!"
    End Function
    Dim hserver
    Set hserver = HproseHttpServer.create()
    hserver.setDebugEnabled(true)
    hserver.addFunction GetRef("hello")
    hserver.start
%>
```

Using it in JScript like this:

```html
<%@ CODEPAGE=65001 %>
<script runat="server" language="JScript" src="hprose/hprose-asp.js"></script>
<script runat="server" language="JScript">
    function hello(name) {
        return "Hello " + name + "!";
    }
    var hserver = new HproseHttpServer();
    hserver.setDebugEnabled(true);
    hserver.addFunction(hello);
    hserver.start();
</script>
```

### Client

Using it in VBScript like this:

```html
<%@ CODEPAGE=65001 %>
<script runat="server" language="JScript" src="hprose/hprose-asp.js"></script>
<%
    Response.CodePage = 65001
    Response.CharSet = "UTF-8"
    Set client = HproseHttpClient.create("http://127.0.0.1/server.asp")
    Response.Write client.hello("World")
%>
```

Using it in JScript like this:

```html
<%@ CODEPAGE=65001 %>
<script runat="server" language="JScript" src="hprose/hprose-asp.js"></script>
<script runat="server" language="JScript">
    Response.CodePage = 65001;
    Response.CharSet = "UTF-8";
    var client = new HproseHttpClient("http://127.0.0.1/server.asp");
    Response.write(client.hello("World"));
</script>
```
