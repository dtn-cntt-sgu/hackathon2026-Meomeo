(method_declaration
  name: (identifier) @name) @def.method

(constructor_declaration
  name: (identifier) @name) @def.method

(class_declaration
  name: (identifier) @name) @def.class

(enum_declaration
  name: (identifier) @name) @def.class

(record_declaration
  name: (identifier) @name) @def.class

(interface_declaration
  name: (identifier) @name) @def.interface

(method_invocation) @call

(object_creation_expression) @call

(import_declaration) @import
