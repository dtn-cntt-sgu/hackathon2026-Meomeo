(function_declaration
  name: (identifier) @name) @def.function

(generator_function_declaration
  name: (identifier) @name) @def.function

(method_definition
  name: (property_identifier) @name) @def.method

(class_declaration
  name: (identifier) @name) @def.class

(variable_declarator
  name: (identifier) @name
  value: [(arrow_function) (function_expression)]) @def.function

(call_expression) @call

(new_expression) @call

(import_statement) @import

(export_statement) @export
