# jsdoc2jsduck
This program takes the output of [JSDoc v3](https://github.com/jsdoc3/jsdoc) and converts it to a format readable by [JSDuck](https://github.com/senchalabs/jsduck).
This allows to create beautiful JSDuck documentations from Javascript projects using JSDoc syntax.
Google Closure can be used in the input Javascript projects.

Please note that jsdoc2jsduck is not yet stable.


## Install

Install with the node package manager:

    [sudo] npm install -g jsdoc2jsduck

You also need to install jsdoc and jsduck:

    [sudo] npm install -g jsdoc
    [sudo] gem install jsduck


## Example usage

    # Create JSDoc intermediate output
    jsdoc -r "path/to/javascript-files" -X > "./jsdoc.json"
    
    # Convert JSDoc output to JSDuck compatible format
    jsdoc2jsduck --in "./jsdoc.json" --out "./jsdoc2jsduck-out/" --filter "./filter.json"
    
    # Generate documentation with JSDuck
    jsduck "./jsdoc2jsduck-out/out.js" --builtin-classes --output "jsduck/"
