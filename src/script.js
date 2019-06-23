/**
 * Generate C# POCO's from an SQL CREATE TABLE script.
 * 
 * @return void
 */
function generate() {
	var input = document.getElementById('input').value;

	// See which options are selected for the output.
	var opt = new OutputOptions();
	opt.addNamespaces = document.getElementById('namespace').checked;
	opt.addAnnotations = document.getElementById('table_annotation').checked;
	opt.gettersSelection = document.getElementById('getter').value;
	opt.settersSelection = document.getElementById('setter').value;
	opt.includeNullableTypes = document.getElementById('nullable_types').checked;
	opt.removeUnderscores = document.getElementById('remove_underscores').checked;
	opt.fieldNameCasingSelection = document.getElementById('casing').value;;
 
 	// Generate the output;
	var result = generateString(input, opt);

	document.getElementById('output').value = result;
}

/**
 * Generate C# POCO's from an SQL CREATE TABLE script.
 * 
 * @param  string input   String containing SQL CREATE script.
 * @param  object options OutputOptions object.
 * @return string 		  String containing C# code.
 */
function generateString(input, options) {
	
	// Perform some cleaning on the whole input string.
	input = cleanSqlString(input);

	// Perform some cleaning on every line of the input string.
	var lines = input.split(/\r?\n/);
	lines = cleanSqlLines(lines);

	// Join the lines together in string again.
	var str = lines.join('');

	// Parse the SQL and retrieve the table names and (unparsed) field info.
	var tables = getRawTables(str);

	// Parse the SQL of table fields and return an array of fields.
	tables.forEach(function(table) {
		table.fields = parseTableFieldsSql(table.fieldsSql);
	});
 
 	// Generate and return the output;
	return createOutput(tables, options);
}

/**
 * Parse the SQL of table fields and return an array of fields.
 * 
 * @param  string str 	The SQL string of the fields of a CREATE TABLE statement.
 * @return Array 		Array with an item for every field containing its properties.	
 */
 function parseTableFieldsSql(str) {

 	str = replaceDatatypeComma(str);

 	// Spit the string into an array of field SQL strings.
 	var fieldsSql = str.split(',');

 	// The array to be filled with TableField objects.
 	var fields = [];

	// Move through the string, one field at a time.
	for (fieldIndex = 0; fieldIndex < fieldsSql.length; fieldIndex++) {

		var fieldSql = fieldsSql[fieldIndex];

		if(isRegularTableField(fieldSql)) {
			fields.push(parseRegularFieldSql(fieldSql));
		} else {
			// Parse special fields (such as a PRIMARY KEY)
			// fields.push(parseSpecialFieldSql(fieldSql));
		}
	}

	return fields;
}

/**
 * Replace comma's in a string by pipes, if they are enclosed by parenthesis.
 * (can probably be replaced by a regex...)
 * 
 * @param  string str
 * @return string
 */
function replaceDatatypeComma(str) {
	var resultStr = '';
	var currentLetter = '';
	var insideParenthesis = false;

	for (charIndex = 0; charIndex < str.length; charIndex++) {

		currentLetter = str[charIndex];	

		if(currentLetter == '(') {
			insideParenthesis = true;
		} else if(currentLetter == ')') {
			insideParenthesis = false;
		}

		if(currentLetter == ',' && insideParenthesis) {
			resultStr += '|';
		} else {
			resultStr += currentLetter;
		}

	}
	return resultStr;
}
/**
 * Check if a piece of SQL from inside a CREATE TABLE statement
 * is a regular table field (and not a constraint/key etc.)
 * 
 * @param  string  str
 * @return boolean		TRUE if is is a regular field.
 */
 function isRegularTableField(str) {
 	var strUpper = str.toUpperCase();

 	if(strUpper.startsWith('PRIMARY KEY') || 
 		strUpper.startsWith('CONSTRAINT')) {
 		return false;
 }
 return true;
}

function parseRegularFieldSql(str) {
	var field = null;

	var strUpper = str.toUpperCase();

	var currentLetter = '';
	var currentWord = '';

	var insideParenthesis = false;
	var isWordCompleted = false;

	// Move through the string, one character at a time.
	for (charIndex = 0; charIndex < str.length + 1; charIndex++) {

		currentLetter = str[charIndex];

		if((currentLetter == ' ' || charIndex == str.length) && !insideParenthesis) {
			// A space is encountered or we are at the end of the string, 
			// and we are not inside parenthesis (like those found in the datatype).
			isWordCompleted = true;
		} else if(currentLetter == '(') {
			insideParenthesis = true;
		} else if(currentLetter == ')') {
			insideParenthesis = false;
		}

		if(isWordCompleted) {
			// Process the finished word.

			if(field == null) {

				// Initialize a new tablefield object and set its name.
				field = new TableField(currentWord);

			} else {
				// A field has already been initialized.
				// Process other field information (such as datatype).

				if(field.dataType == null) {
					field.dataType = currentWord;
				}
			}

			currentWord = '';
			isWordCompleted = false;
		}

		if(currentLetter != ' ') {
			currentWord += currentLetter;
		}
	}

	// Check if the field can be NULL.
	if(strUpper.includes('NOT NULL')) {
		field.isNullable = false;
	} else {
		field.isNullable = true;
	}

	return field;
}

function parseSpecialFieldSql(str) {
	var field = [];

	return field;
}

/**
 * Parse the SQL and retrieve the table names and (unparsed) field info.
 * 
 * @param  string str 	The full SQL string.
 * @return array		Array with the table name as key and 
 *                      the unparsed SQL of the table fields as the value.
 */
 function getRawTables(str) {
 	var tables = [];
 	var table = null;

	// Table info.
	var tableName = '';
	var tableFieldsSql = '';

	// Location variables.
	var inTableDefinition = false;
	var inFieldLength = false; // When between the parenthesis: varchar(32).

	var currentLetter = '';
	var lastWord = '';
	var currentWord = '';

	// Move through the string character by character.
	for (i = 0; i < str.length; i++) {
		
		currentLetter = str[i];

		if (currentLetter == '(') {

			if(inTableDefinition) {
				// Already in table definition.
				
				// Probably a field length attribute.
				inFieldLength = true;
			} else {

				// Table definition has been entered.
				inTableDefinition = true;
				
				// Reset some variables.
				tableFieldsSql = '';
				currentLetter = '';
				lastWord = '';
				currentWord = '';
			}
		} else if (currentLetter == ')') {
			
			if(inTableDefinition && inFieldLength) {

				// Field length completed.
				inFieldLength = false;
			} else {

				// Table definition completed.
				inTableDefinition = false;
				
				// Place in the final list of tables.
				table = new TableDefinition(tableName);
				table.fieldsSql = tableFieldsSql;
				tables.push(table);
				
				// Reset some variables.
				tableName = '';
				tableFieldsSql = '';
			}
		} else if(!inTableDefinition && currentLetter == ' ') {
			
			if(lastWord.toUpperCase() == 'TABLE') {
				// Found the table name.
				tableName = currentWord;
			}

			lastWord = currentWord;
			currentWord = '';
		}

		if(inTableDefinition) {
			tableFieldsSql += currentLetter;
		} else if(currentLetter != ' ') {
			currentWord += currentLetter;
		}
	}

	return tables;
}

function cleanSqlLines(lines) {
	
	for (i = 0; i < lines.length; i++) {
		
		// Trim the line.
		lines[i] = lines[i].trim();
		
		// Clear unneeded lines.
		if (lines[i].startsWith('--')) {
			lines[i] = '';
		}
	}


	return lines;
}
function cleanSqlString(str) {

	// Delete all characters except the ones listed below.
	str = str.replace(/[^a-zA-Z0-9_(),\.\n\s]/g,'');

	return str;
}

function TableDefinition (name) {
	this.name = name;
	this.fieldsSql = null;
}

function TableField (name) {
	this.name = name;
	this.dataType = null;
}

function OutputOptions () {
	this.addNamespaces = false;
	this.addAnnotations = false;
	this.gettersSelection = 0;
	this.settersSelection = 0;
	this.includeNullableTypes = false;
	this.removeFieldUnderscores = false;
	this.fieldNameCasingSelection = 0;
}

function createOutput(tables, options) {
	var result = '';

	// List of access modifiers for getters/setters.
	// Modifier 'internal' is empty because it is default if no access modifier is specified.
	var accessModifiers = ['', 
		'public ', 'protected ', '', 'protected internal ', 
		'private ', 'private protected '];
	
	for (i = 0; i < tables.length; i++) {
		
		var table = tables[i];
		
		var spaces = '';

		// Remove the schema part of the name.
		var tableName = table.name;
		var tableNameSplit = table.name.split('.');
		if(tableNameSplit.length == 2) {
			tableName = tableNameSplit[1];
		}

		// Namespace opening statement.
		if(options.addNamespaces) {
			result += 'namespace SampleNamespace\n{\n';
			spaces += '    ';
		}

		// Table annotation.
		if(options.addAnnotations) {
			result += spaces + '[Table("' + table.name + '")]\n';
		}
		
		// Class opening statement.
		result += spaces + 'public class ' + capitalizeFirstLetter(tableName) + '\n' + spaces + '{\n';
		spaces += '    ';

		// Fields.
		for (a = 0; a < table.fields.length; a++) {
			var field = table.fields[a];

			// Getters and setters.
			var getSetStr = '';
			if(options.gettersSelection > 0 || options.settersSelection > 0) {
				getSetStr = ' { ';

				if(options.gettersSelection > 0) {
					getSetStr += accessModifiers[options.gettersSelection] + 'get; ';
				}
				
				if(options.settersSelection > 0) {
					getSetStr += accessModifiers[options.settersSelection] + 'set; ';
				}

				getSetStr += '}';
			}

			result += spaces + 'public ' + convertDataTypeToCS(field.dataType) + ' ' + 
				mutateFieldName(field.name, options) + getSetStr + ';\n';
		}

		// Class and namespace closing statements.
		if(options.addNamespaces) {
			result += '    }\n}';
		} else {
			result += '}';
		}

		// Add newlines between classes.
		if (i < tables.length - 1) {
			result += '\n\n';
		}
	}
	
	return result;
}

function capitalizeFirstLetter(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function convertDataTypeToCS(dataType) {
	if(!dataType) return 'object';

	dataType = dataType.toLowerCase();
	
	if(dataType == 'serial' || dataType.startsWith('int')) {
		return 'int';
	} else if (dataType.startsWith('varchar') || dataType == 'text' || dataType.startsWith('character')) {
		return 'string';
	} else if (dataType.startsWith('numeric') || dataType == 'decimal') {
		return 'Decimal';
	} else if (dataType.startsWith('timestamp') || dataType.startsWith('date')) {
		return 'DateTime';
	} else if (dataType == 'bool' || dataType == 'boolean' || dataType == 'tinyint(1)') {
		return 'bool';
	} else {
		return 'object';
	}
}

/**
 * Mutate a field name.
 * 
 * @param  {string} name
 * @param  {OutputOptions} options
 * @return {string}
 */
function mutateFieldName(name, options) {

	if(options.fieldNameCasingSelection == 1) {
		// Only capitalize the first letter.

		name = capitalizeFirstLetter(name);

	} else if(options.fieldNameCasingSelection == 2) {
		// CamelCase.

		// Split the name on underscore.
		var pieces = name.split('_');

		for (b = 0; b < pieces.length; b++) {
			pieces[b] = capitalizeFirstLetter(pieces[b]);
		}

		// Put the underscores back.
		name = pieces.join('_');
	}

	// Remove underscores if desired.
	if(options.removeUnderscores) {
		return name.replace('_', '');
	} else {
		return name;
	}
}
