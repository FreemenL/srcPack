## sourcePack
### `模仿webpack 基本编译原理  试写一个模块打包工具 `

## 整体思路：
* 初始化参数：从配置文件 和 Shell 语句中读取与合并参数，得出最终的参数； 
* 开始编译：用上一步得到的参数初始化 Compiler 对象，加载所有配置的插件，执行对象的 run 方法开始执行编译；
* 确定入口：根据配置中的 entry 找出所有的入口文件；
* 编译模块：从入口文件出发，调用所有配置的 Loader 对模块进行翻译，再找出该模块依赖的模块，再递归此步骤直到所有入口依赖的文件都经过了处理；
* 完成模块编译：在经过第4步使用 Loader 翻译完所有模块后，得到了每个模块被翻译后的最终内容以及它们之间的依赖关系；
* 输出资源：根据入口和模块之间的依赖关系，组装成一个个包含多个模块的 Chunk，再把每个 Chunk 转换成一个单独的文件加入到输出列表，这步是可以修改输出内容的最后机会；
* 输出完成：在确定好输出内容后，根据配置确定输出的路径和文件名，把文件内容写入到文件系统。
在以上过程中，Webpack 会在特定的时间点广播出特定的事件，插件在监听到感兴趣的事件后会执行特定的逻辑，并且插件可以调用 Webpack 提供的 API 改变 Webpack 的运行结果。

## webpack 中的 hooks
* entryOption 读取配置文件
* afterPlugins 加载所有的插件
* run 开始执行编译流程
* compile 开始编译
* afterCompile 编译完成
* emit 写入文件
* done 完成整体流程

##具体实现步骤：
* 1  新建两个目录 `sourcepack`(自实现打包工具目录) 和 `usepack`(模拟项目目录);

`usepack 的目录结构如下`

```
├── src                      # 源码目录
│   ├── a                    # 模块代码
│   ├── loaders              # 存放loadder文件
│   ├── plugins              # 存放plugin文件
│   ├── index.js             # 入口文件
│   ├── index.less           # less文件
├── webpack.config.json      # webpack 配置文件
├── package.json             # 项目描述
```
1，编写webpack 配置 webapck.config.js如下：

```javascript 

const path = require("path");
const entryOptionPlugin = require("./src/plugins/entry-option-plugin");

module.exports = {
	entry:"./src/index.js",
	mode:"development",
	output:{
		path:path.resolve("dist"),
		filename:"bundle.js"
	},
	resolveLoader:{
		modules:'./src/loaders'
	},
	module:{
		rules:[{
			test:/\.less$/,
			loader:['style-loader','less-loader']
		}]
	},
	plugins:[
		new entryOptionPlugin()
	]
}

```
2，入口文件 index.js

```javascript 
    let a1 = require("./a/a1");
    require('./index.less');
    alert("sourcePack");
```

3, a目录下 a1.js
```javascript 
    const a2 = require('./a2.js');
    module.exports = a2;
```
a目录下 a2.js
```javascript 
   module.exports = "this is a2";
```
4.plugins 目录下 entry-option-plugin.js 
```javascript 

class entryOptionPlugin {
	constructor(options){

	}
	apply(compiler){
		compiler.hooks.entryOption.tap('entryOptionPlugin',function(options){
			console.log("参数解析完毕...")
		});
	}
}

module.exports = entryOptionPlugin;

```

5, loaders目录下 less-loader.js

```
    let less = require("less");
    module.exports = function(source){
        let css;
        less.render(source,(error,output)=>{
            css = output.css;
        });
        return css.replace(/\n/g,'\\n');
    }
```
loaders目录下 style-loader.js

```
  module.exports = function(source){
	let style = `
		let style = document.createElement('style');
		style.innerHTML = ${JSON.stringify(source)};
		document.head.appendChild(style);
	`;
	return style;
}

```
`sourcepack 的目录结构如下`

```
├── bin                      # 主文件目录
│   ├── sourcepack.js        # 主文件
├── lib                      # 工具类目录
│   ├── compiler.js          # compiler 类
│   ├── main.ejs             # ejs 模版
├── package.json             # 项目描述
```

1,package.json 中添加 bin字段

```bash 
  "bin": {
    "sourcepack": "./bin/sourcepack.js"
  },
```
2, 执行 `npm link ` 建立软连接 

3，bin/sourcepack.js

```javascript 

const path = require("path");
const fs = require("fs");
const root = process.cwd();
const configPath = path.join(root,"webpack.config.js");
const config = require(configPath);
const Compiler = require('../lib/Compiler');
const compiler = new Compiler(config);
//发射 entryOption 事件
compiler.hooks.entryOption.call(config);
compiler.run();

```

4,lib/compiler.js 

```javascript

const { SyncHook }  = require("tapable");
const path = require("path");
const fs = require("fs");
//生成AST 
const esprima = require("esprima");
//遍历语法树
const estraverse = require("estraverse");
//生成新代码
const escodegen = require("escodegen");

const ejs = require("ejs");

class Compiler{
	constructor(options){
		//取得当前工作目录
		this.root = process.cwd();
		//存放着所有的模块 moduleId => 原代码
		this.modules = {};
		this.options = options;
		this.hooks = {
			entryOption:new SyncHook(['config']),
			afterPlugins:new SyncHook(['afterPlugins']),
			run:new SyncHook(['run']),
			compile:new SyncHook(['compile']),
			afterCompile:new SyncHook(['afterCompile']),
			emit:new SyncHook(['emit']),
			done:new SyncHook(['done'])
		}
		let plugins = options.plugins;
		if(plugins&&plugins.length>0)
			plugins.forEach(plugin=>{
				plugin.apply(this);
			})
		//触发插件挂载完成事件
		this.hooks.afterPlugins.call(this);
	}
	// 找到入口文件 开始编译
	run(){
		const { 
			entry, 
			output:{ path: pathName, filename }
		}= this.options;
		let _this = this;
		const entryPath = path.join(this.root,entry);

		this.hooks.compile.call(this);
		this.parseModule(entryPath,true);
		this.hooks.afterCompile.call(this);

		let bundle = ejs.compile(fs.readFileSync(path.join(__dirname,'main.ejs'),"utf8"))({
			modules:this.modules,entryId:this.entryId
		});

		this.hooks.emit.call(this);

		fs.writeFileSync(path.join(pathName,filename),bundle);

		this.hooks.done.call(this);
        	
	}

	parseModule(modulePath,isEntry){
		const { 
			module: { rules } ,
			resolveLoader:{ modules: loaderPath }
		}= this.options;
		//取得入口文件内容 
		let source = fs.readFileSync(modulePath,'utf8');

		for (var i =0;i < rules.length; i++) {
			let rule = rules[i];
			if(rule.test.test(modulePath)){
				let loaders = rule.use||rule.loader;
				if( Object.prototype.toString.call(loaders)==='[object Array]'){
					
					for(let j = loaders.length-1;j>=0;j--){
						let loader = loaders[j];
						loader = require(path.join(this.root,loaderPath,loader));
						source = loader(source);
					}

				}else if( Object.prototype.toString.call(loaders)=== "[object Object]"){
					loaders  = loader.loader;
				}
			}
		}
		let parentPath = path.relative(this.root,modulePath);
		//TODO 执行loader 进行转换 
		let result = this.parse(source,path.dirname(parentPath));//用来解析模块内容并返回依赖的模块 

		this.modules['./'+parentPath] = result.source;
		if(isEntry) { this.entryId = './'+parentPath };

        let requires = result.requires;
        if( requires && requires.length>0){
        	requires.forEach(function(req){
        		this.parseModule(path.join(this.root,req));
        	}.bind(this))
        }
	}
	//对文件内容进行转义。1.处理文件中的路径引用问题 2，生成新的代码
	parse(source,parentPath){ // parentPath 相对路径 
		//生成AST
		let ast = esprima.parse(source);
		//存放引用文件的路径
		const requires = [];
		//遍历语法树。1.找到此模块依赖的模块 2，替换掉老的加载路径 
		estraverse.replace(ast,{
			enter(node,parent){
				if(node.type == "CallExpression" && node.callee.name == "require"){
					let name = node.arguments[0].value;
					name += (name.lastIndexOf('.')>0?"":".js");
				    let moduleId = "./"+path.join(parentPath,name);
				    requires.push(moduleId);
				    node.arguments= [{type:"Literal",value:moduleId}];
				    //返回新节点替换老节点
				    return node; 
				}
			}
		});
		source = escodegen.generate(ast);
		return { requires, source };
	}
}

module.exports = Compiler;

```
5,lib/main/ejs
```ejs 
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "<%-entryId%>");
/******/ })
/************************************************************************/
/******/ ({
	<%
		for(let moduleId in modules){ %>
			/***/ "<%-moduleId%>":
			/***/ (function(module, exports, __webpack_require__) {

			eval(`<%-modules[moduleId].replace(/require/g,"__webpack_require__")%>`);

			/***/ }),
	<% }
	%>

/******/ });
```

* 两个目录下载好相应的依赖后 在usewebpack 目录执行sourcepack 命令 
* 在dist目录新建index.html 
```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>Document</title>
</head>
<body>
	<h1>sourcePack</h1>
	<script src="./bundle.js"></script>
</body>
</html>

```
