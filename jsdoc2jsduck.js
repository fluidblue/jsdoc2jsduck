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
var jsonQuery = require('json-query');

var filter = null;

// Split on symbols: . # ~ :
var regexPath = new RegExp('[.#~:]', 'g');

// TODO: Remove
debugger;

function getPath(longname) {
	return longname.split(regexPath);
}

function processJSDoc(jsdoc) {
	// TODO: Add author
	// TODO: Add copyright
	// TODO: Add defaultvalue (and defaultvaluetype)
	// TODO: Add exceptions
	// TODO: Add (member): optional
	// TODO: Add (member): virtual

	if (jsdoc.undocumented) {
		console.error('Warning: Missing or invalid JSDoc for ' + jsdoc.longname);
	}

	switch (jsdoc.kind) {
		case 'class':
			return processClass(jsdoc);
		case 'function':
			return processMethod(jsdoc);
		case 'member':
		case 'constant':
			return processMember(jsdoc);
		case 'package':
			// Ignore, because JSDuck builds package list automatically.
			return '';
		default:
			console.error('Warning: Unsupported documentation type (' + jsdoc.kind + ') in file '
				+ jsdoc.meta.path + '/' + jsdoc.meta.filename + ':' + jsdoc.meta.lineno);
			return '';
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

function isAllowedPackage(scope) {
	if (filter === null || !filter.allowedPackages) {
		return true;
	}
	if (!(filter.allowedPackages instanceof RegExp)) {
		filter.allowedPackages = new RegExp(filter.allowedPackages);
	}
	return filter.allowedPackages.test(scope);
}

function readJSONFile(inFile) {
	data = fs.readFileSync(inFile, 'utf8');
	return JSON.parse(data);
}

function getMissingStaticClasses(data) {
	var missingStaticClasses = [];

	outerLoop:
	for (var i = 0; i < data.length; i++) {
		if (!data[i].memberof || data[i].kind === 'class') {
			continue outerLoop;
		}

		for (var j = 0; j < data.length; j++) {
			if (data[i].memberof === data[j].longname) {
				continue outerLoop;
			}
		}

		if (data[i].longname.indexOf('~') === -1 &&
			data[i].longname.split('#').length < 2) {

			if (missingStaticClasses.indexOf(data[i].memberof) === -1) {
				missingStaticClasses.push(data[i].memberof);
			}
		}
	}
	return missingStaticClasses;
}

function addMissingStaticClasses(data, missingStaticClasses) {
	for (var i = 0; i < missingStaticClasses.length; i++) {
		path = getPath(missingStaticClasses[i]);
		name = path.pop();
		classData = {
			description: '',
			kind: 'class',
			access: 'public',
			name: name,
			longname: missingStaticClasses[i],
			scope: 'static',
			undocumentedStaticClass: true
		};
		if (path.length > 1) {
			classData.memberof = path.join('.');
		}
		data.push(classData);
		console.error('Warning: Missing static class definition for ' + classData.longname);
	}
}

function getClasses(data) {
	var filterByClass = function(jsdoc) {
		return jsdoc.kind === 'class';
	};
	return data.filter(filterByClass);
}

function testForInheritdocsWithMissingInherited(data) {
	var inheritdocs = [];
	var inherited = [];
	var inheritdocsWithMissingInherited = [];
	for (var i = 0; i < data.length; i++) {
		if (data[i].inheritdoc !== undefined) {
			inheritdocs.push(data[i].longname);
		}
		if (data[i].inherited === true) {
			inherited.push(data[i].longname);
		}
	}
	for (var i = 0; i < inheritdocs.length; i++) {
		if (inherited.indexOf(inheritdocs[i]) === -1) {
			inheritdocsWithMissingInherited.push(inheritdocs[i]);
		}
	}
	console.log(inheritdocs.length);
	console.log(inherited.length);
	console.log(inheritdocsWithMissingInherited);
}

function createNamedData(data) {
	var namedData = {};
	for (var i = 0; i < data.length; i++) {
		if (!isAllowedPackage(data[i].longname) || !isAllowedScope(data[i].scope)) {
			continue;
		}
		if (namedData.hasOwnProperty(data[i].longname)) {
			namedData[data[i].longname].push(data[i]);
		} else {
			namedData[data[i].longname] = [data[i]];
		}
	}
	return namedData;
}

function removeInheritdocItems(namedData) {
	for (var longname in namedData) {
		if (!namedData.hasOwnProperty(longname)) {
			continue;
		}

		var filterByInheritdoc = function(jsdoc) {
			// Remove "inheritdoc" items, which contain no valuable information.
			return jsdoc.inheritdoc === undefined;
		};
		var jsdocs = namedData[longname].filter(filterByInheritdoc);

		// Only apply filter when other JSDocs exist.
		if (jsdocs.length > 0) {
			namedData[longname] = jsdocs;
		}
	}
}

function removeInheritedDocs(namedData) {
	for (var longname in namedData) {
		if (!namedData.hasOwnProperty(longname)) {
			continue;
		}

		var filterInheritedDocs = function(jsdoc) {
			// Remove docs for inherited but not overriden members for which an
			// JSDoc exist. JSDuck will add inherited methods to classes automatically with
			// additional inheritance information.
			var removeDoc = jsdoc.inherits !== undefined &&
				jsdoc.overrides === undefined &&
				namedData.hasOwnProperty(jsdoc.inherits);
			return !removeDoc;
		}
		var jsdocs = namedData[longname].filter(filterInheritedDocs);
		if (jsdocs.length > 0) {
			namedData[longname] = jsdocs;
		} else {
			delete namedData[longname];
		}
	}
}

function removeDuplicates(namedData) {
	testForItemsWithMultipleEntries(namedData);
	removeInheritdocItems(namedData);
	testForItemsWithMultipleEntries(namedData);

	console.log("JSDocs before removeInheritedDocs: " + Object.keys(namedData).length);
	removeInheritedDocs(namedData);
	console.log("JSDocs after removeInheritedDocs: " + Object.keys(namedData).length);
}

function testForItemsWithMultipleEntries(namedData) {
	var itemsWithMultipleEntries = 0;
	for (var longname in namedData) {
		if (namedData.hasOwnProperty(longname)) {
			if (namedData[longname].length > 1) {
				var test = namedData[longname];
				//console.log("Multiple entries for " + longname + ": " + namedData[longname].length);
				//console.log(namedData[longname]);
				itemsWithMultipleEntries++;
			}
		}
	}
	console.log("itemsWithMultipleEntries: " + itemsWithMultipleEntries);
}

function convertNamedDataToData(namedData) {
	var data = [];
	for (var longname in namedData) {
		if (!namedData.hasOwnProperty(longname)) {
			continue;
		}
		for (var i = 0; i < namedData[longname].length; i++) {
			data.push(namedData[longname][i]);
		}
	}
	return data;
}

function getClassMembers(namedData, className) {
	var filterByMember = function(jsdoc) {
		return jsdoc.memberof === className;
	};
	return data.filter(filterByMember);
}

function processFile(inFile, outDir) {
	data = readJSONFile(inFile);

	// TODO: Remove
	//testForInheritdocsWithMissingInherited(data);

	var namedData = createNamedData(data);
	removeDuplicates(namedData);
	data = convertNamedDataToData(namedData);

	var fileContent = '';
	var processedJSDocs = [];

	var missingStaticClasses = getMissingStaticClasses(data);
	addMissingStaticClasses(data, missingStaticClasses);

	var classes = getClasses(data);
	for (var i = 0; i < classes.length; i++) {
		processedJSDocs.push(classes[i].longname);
		var members = getClassMembers(namedData, classes[i].longname);
		var isPackage = false;
		if (classes[i].undocumentedStaticClass) {
			// TODO: Test
			if (classes[i].longname === "conqat.base") {
				console.log(members);
			}
			
			isPackage = true;
			for (var j = 0; j < members.length; j++) {
				if (members[j].kind !== "class") {
					isPackage = false;
					break;
				}
			}
		}
		if (!isPackage) {
			fileContent += processJSDoc(classes[i]);
		}
		for (var j = 0; j < members.length; j++) {
			fileContent += processJSDoc(members[j]);
			processedJSDocs.push(members[j].longname);
		}
	}

	for (var i = 0; i < data.length; i++) {
		if (processedJSDocs.indexOf(data[i].longname) === -1) {
			if (data[i].longname.indexOf('~') === -1 &&
				data[i].longname.split('#').length < 2 &&
				missingStaticClasses.indexOf(data[i].memberof) === -1) {

				console.error('Warning: Ignoring ' + data[i].longname);
			}
		}
	}

	saveFile(outDir + '/out.js', fileContent);
}

function generateType(type) {
	if (!type || !type.names) {
		return '';
	}

	var docType = ''
	for (var i = 0; i < type.names.length; i++) {
		if (docType.length > 0) {
			docType += '|';
		}
		docType += type.names[i];

	}
	if (docType.length > 0) {
		docType = '{' + docType + '} ';
	}
	return docType;
}

function docParams(params) {
	if (!params) {
		return '';
	}

	var doc = '';
	for (var i = 0; i < params.length; i++) {
		var type = generateType(params[i].type);
		var name = '';
		if (params[i].name) {
			if (params[i].optional) {
				name = " [" + params[i].name + "]";
			} else {
				name = " " + params[i].name;
			}
		}
		var description = params[i].description ? ' ' + params[i].description : '';
		doc += docLine('@param ' + type + name + description);
	}
	return doc;
}

function docReturn(returns) {
	if (!returns) {
		return '';
	}

	var doc = '';
	for (var i = 0; i < returns.length; i++) {
		if (returns[i] === null) {
			// Return tag was empty
			continue;
		}

		var type = generateType(returns[i].type);
		var description = returns[i].description ? ' ' + returns[i].description : '';
		if (type.length + description.length > 0) {
			doc += docLine('@return ' + type + description);
		}
	}
	return doc;
}

function docAccessLevel(access) {
	// Everything is public by default and @public tags
	// generate warnings, therefore leave them out.
	if (!access || access === 'public') {
		return '';
	}
	return docLine('@' + access);
}

function processMember(item) {
	var doc = docBegin();

	doc += docLine('@property ' + generateType(item.type) + item.name);
	doc += docAccessLevel(item.access);
	if (item.deprecated === true) {
		doc += docLine('@deprecated');
	}
	if (item.kind === 'constant') {
		doc += docLine('@readonly');
	}
	if (item.scope === "static") {
		doc += docLine("@static");
	}
	doc += docLine(item.description ? item.description : '');

	return docEnd(doc);
}

function processMethod(item) {
	var doc = docBegin();

	doc += docLine('@method ' + item.name);
	doc += docAccessLevel(item.access);
	if (item.deprecated === true) {
		doc += docLine('@deprecated');
	}
	if (item.scope === "static") {
		doc += docLine("@static");
	}
	doc += docLine(item.description ? item.description : '');
	doc += docParams(item.params);
	doc += docReturn(item.returns);

	return docEnd(doc);
}

function isStaticClass(jsdoc) {
	return jsdoc.undocumentedStaticClass ||
		(jsdoc.kind === "class" &&
		jsdoc.meta &&
		jsdoc.meta.code &&
		jsdoc.meta.code.type === "MemberExpression");
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
	if (item.deprecated === true) {
		doc += docLine('@deprecated');
	}
	doc += docLine(item.description);
	if (isStaticClass(item)) {
		doc += docLine('@static');
		//console.log("Info: Static class found: " + item.longname);
	} else {
		doc += docLine('@constructor');
		doc += docParams(item.params);
	}

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
			console.error('Error: Cannot save output file ' + file);
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

	var inFile = path.resolve(argv.in);
	var outDir = path.resolve(argv.out);
	var filterFile = path.resolve(argv.filter);

	console.log('Input file: ' + inFile);
	console.log('Output dir: ' + outDir);

	if (filterFile) {
		console.log('Using filter settings: ' + filterFile);
		filter = readJSONFile(filterFile);
	}

	processFile(inFile, outDir);
}

main();
