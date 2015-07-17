#!/usr/local/bin/node

/*!
 * ================================================================
 * 
 * jsdoc2jsduck
 * https://github.com/fluidblue/jsdoc2jsduck
 * 
 * Created by Max Geissler
 * http://maxgeissler.com
 * 
 * You should have received a copy of the license along with this
 * program; if not, see <https://github.com/fluidblue/jsdoc2jsduck>
 * 
 * ================================================================
 */

var fs = require('fs');
var path = require('path');
var optimist = require('optimist');

var filter = null;

// TODO: Remove
debugger;

function DocTree() {
	this.jsdocs = null;
	this.children = null;
}

DocTree.prototype.addJSDoc = function(jsdoc) {
	if (this.jsdocs === null) {
		this.jsdocs = [jsdoc];
	} else {
		this.jsdocs.push(jsdoc);
	}
};

DocTree.prototype.putNewChild = function(qualifier) {
	if (this.children === null) {
		this.children = {};
	}
	if (!this.children.hasOwnProperty(qualifier)) {
		this.children[qualifier] = new DocTree();
	}
	return this.children[qualifier];
};

function getPath(longname) {
	// Split on symbols: . # ~
	return longname.split(new RegExp('[.#~]', 'g'));
}

function processPath(currentNode, path, jsdoc) {
	if (path.length === 0) {
		currentNode.addJSDoc(jsdoc);
		return;
	}

	var qualifier = path.shift();
	var child = currentNode.putNewChild(qualifier);

	processPath(child, path, jsdoc);
}

function addItemToDocTree(docTree, jsdoc) {
	// TODO: Remove
	// if (!(jsdoc.longname.lastIndexOf("ts.activity.ActivityFilterBase", 0) === 0 ||
	// 	jsdoc.longname.lastIndexOf("ts.activity.ActivityViewBase", 0) === 0)) {
	// 	return;
	// }

	if (!isAllowedScope(jsdoc.scope)) {
		return;
	}

	processPath(docTree, getPath(jsdoc.longname), jsdoc);
}

function processJSDoc(jsdoc) {
	// TODO: Add author
	// TODO: Add borrowed / extends / inherited / inherits
	// TODO: Add copyright
	// TODO: Add defaultvalue (and defaultvaluetype)
	// TODO: Add deprecated
	// TODO: Add exceptions
	// TODO: Add (member): optional
	// TODO: Add (member): overrides
	// TODO: Add (member): readonly
	// TODO: Add (member): virtual

	// TODO: Handle constant, param
	switch (jsdoc.kind) {
		case "class":
			return processClass(jsdoc);
		case "function":
			return processMethod(jsdoc);
		case "member":
		case "constant":
			return processMember(jsdoc);
		case "package":
			// Ignore, because JSDuck builds package list automatically.
			return "";
		default:
			console.log("Unsupported documentation type (" + jsdoc.kind + ") in file "
				+ jsdoc.meta.path + "/" + jsdoc.meta.filename + ":" + jsdoc.meta.lineno);
			return "";
	}
}

function isAllowedChild(parentKind, childKind) {
	if (filter === null || !filter.allowedChildren || !filter.allowedChildren.hasOwnProperty(parentKind)) {
		return true;
	}
	return filter.allowedChildren[parentKind].indexOf(childKind) > -1;
}

function isAllowedScope(scope) {
	if (filter === null || !filter.allowedScopes) {
		return true;
	}
	return filter.allowedScopes.indexOf(scope) > -1;
}

function processDocTree(docTree, parentKind) {
	var output = "";
	if (docTree.jsdocs !== null) {
		var allowedJSDocs = [];
		for (var i = 0; i < docTree.jsdocs.length; i++) {
			if (isAllowedChild(parentKind, docTree.jsdocs[i].kind)) {
				allowedJSDocs.push(docTree.jsdocs[i]);
			} else {
				console.log("Filtered: " + docTree.jsdocs[i].longname);
			}
		}
		for (var i = 0; i < allowedJSDocs.length; i++) {
			output += processJSDoc(allowedJSDocs[i]);

			// TODO: Check
			parentKind = allowedJSDocs[i].kind;

			if (i >= 1) {
				console.log("Warning: Multiple JSDocs found for " + allowedJSDocs[i].longname);
				// TODO
				return;
			}
		}
	}
	if (parentKind === "root") {
		parentKind = "package";
	}
	if (docTree.children !== null) {
		for (var qualifier in docTree.children) {
			if (docTree.children.hasOwnProperty(qualifier)) {
				output += processDocTree(docTree.children[qualifier], parentKind);
			}
		}
	}
	return output;
}

function readJSONFile(inFile) {
	data = fs.readFileSync(inFile, 'utf8');
	return JSON.parse(data);
}

function processFile(inFile, outDir)
{
	data = readJSONFile(inFile);

	var docTree = new DocTree();
	for (var i = 0; i < data.length; i++) {
		addItemToDocTree(docTree, data[i]);
	}

	var fileContent = processDocTree(docTree, "root");
	saveFile(outDir + '/out.js', fileContent);
}

function generateType(type) {
	if (!type || !type.names) {
		return "";
	}

	var docType = ""
	for (var i = 0; i < type.names.length; i++) {
		if (docType.length > 0) {
			docType += "|";
		}
		docType += type.names[i];

	}
	if (docType.length > 0) {
		docType = "{" + docType + "} ";
	}
	return docType;
}

function docParams(params) {
	if (!params) {
		return "";
	}

	var doc = "";
	for (var i = 0; i < params.length; i++) {
		var type = generateType(params[i].type);
		var name = params[i].name ? " " + params[i].name : "";
		var description = params[i].description ? " " + params[i].description : "";
		doc += docLine("@param " + type + name + description);
	}
	return doc;
}

function docReturn(returns) {
	if (!returns) {
		return "";
	}

	var doc = "";
	for (var i = 0; i < returns.length; i++) {
		if (returns[i] === null) {
			// Return tag was empty
			continue;
		}

		var type = generateType(returns[i].type);
		var description = returns[i].description ? " " + returns[i].description : "";
		if (type.length + description.length > 0) {
			doc += docLine("@return " + type + description);
		}
	}
	return doc;
}

function docAccessLevel(access) {
	// Everything is public by default and @public tags
	// generate warnings, therefore leave them out.
	if (!access || access === "public") {
		return "";
	}
	return docLine("@" + access);
}

function processMember(item) {
	var doc = docBegin();

	doc += docLine('@property ' + generateType(item.type) + item.name);
	doc += docAccessLevel(item.access);
	if (item.kind === "constant") {
		doc += docLine('@readonly');
	}
	doc += docLine(item.description ? item.description : "");

	return docEnd(doc);
}

function processMethod(item) {
	var doc = docBegin();

	doc += docLine('@method ' + item.name);
	doc += docAccessLevel(item.access);
	doc += docLine(item.description ? item.description : "");
	doc += docParams(item.params);
	doc += docReturn(item.returns);

	return docEnd(doc);
}

function processClass(item) {
	var doc = docBegin();

	doc += docLine('@class ' + item.longname);
	if (item.augments) {
		for (var i = 0; i < item.augments.length; i++) {
			doc += docLine('@extends ' + item.augments[i]);
		}
	}
	doc += docAccessLevel(item.access);
	doc += docLine(item.description);
	doc += docLine("@constructor");
	doc += docParams(item.params);

	return docEnd(doc);
}

function docBegin() {
	return '/**';
}

function docLine(line) {
	return '\n * ' + line
}

function docEnd(doc) {
	return doc + '\n */\n';
}

function saveFile(file, data) {
	fs.writeFile(file, data, function (err) {
		if (err) {
			console.log('Error: Cannot save output file ' + file);
			process.exit(1);
		}
	});
}

function getArgv() {
	return optimist.usage('jsdoc2jsduck.\nUsage: $0')
		.demand('i')
		.alias('i', 'in')
		.describe('i', 'Input JSON file generated by JSDoc')

		.demand('o')
		.alias('o', 'out')
		.describe('o', 'Output directory')
		.default('o', './out')

		.alias('f', 'filter')
		.describe('f', 'JSON file containing filter settings')

		.argv;
}

function main() {
	var argv = getArgv();

	var inFile = argv.in;
	var outDir = argv.out;
	var filterFile = argv.filter;

	console.log('Input file: ' + inFile);
	console.log('Output dir: ' + outDir);

	if (filterFile) {
		console.log('Using filter settings: ' + filterFile);
		filter = readJSONFile(filterFile);
	}

	processFile(inFile, outDir);
}

main();
