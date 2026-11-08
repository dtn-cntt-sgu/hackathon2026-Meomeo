(function_declaration
  name: (identifier) @name) @def.function

(generator_function_declaration
  name: (identifier) @name) @def.function

(method_definition
  name: (property_identifier) @name) @def.method

(class_declaration
  name: (type_identifier) @name) @def.class

(abstract_class_declaration
  name: (type_identifier) @name) @def.class

(interface_declaration
  name: (type_identifier) @name) @def.interface

(type_alias_declaration
  name: (type_identifier) @name) @def.type

(variable_declarator
  name: (identifier) @name
  value: [(arrow_function) (function_expression)]) @def.function

(call_expression) @call

(new_expression) @call

(import_statement) @import

(export_statement) @export
