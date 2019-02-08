
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