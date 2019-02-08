#!  /usr/bin/env node 

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