# Hprose for ASP

>---
- **[简介](#简介)**
- **[使用](#使用)**
    - **[服务器](#服务器)**
    - **[客户端](#客户端)**

>---

## 简介

*Hprose* 是高性能远程对象服务引擎（High Performance Remote Object Service Engine）的缩写。

它是一个先进的轻量级的跨语言跨平台面向对象的高性能远程动态通讯中间件。它不仅简单易用，而且功能强大。你只需要稍许的时间去学习，就能用它轻松构建跨语言跨平台的分布式应用系统了。

*Hprose* 支持众多编程语言，例如：

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

通过 *Hprose*，你就可以在这些语言之间方便高效的实现互通了。

本项目是 Hprose 的 ASP 语言版本实现。

## 使用

你不需要使用 JScript 的源文件，你只需要在你的 asp 页面中包含 `hprose-asp.js` 就够了。你可以用 VBScript 或 JScript 来编写 hprose 服务器和客户端。

### 服务器

使用 VBScript 来写是这样的：

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

使用 JScript 来写是这样的：

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

### 客户端

使用 VBScript 来写是这样的：

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

使用 JScript 来写是这样的：

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
