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