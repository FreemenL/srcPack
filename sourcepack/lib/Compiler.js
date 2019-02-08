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