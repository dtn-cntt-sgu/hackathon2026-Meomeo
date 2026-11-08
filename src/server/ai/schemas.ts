import { Type, type Schema } from "@google/genai";

export const S: Schema = { type: Type.STRING };
export const I: Schema = { type: Type.INTEGER };
export const B: Schema = { type: Type.BOOLEAN };

export function en(values: readonly string[] | string[]): Schema {
  return {
    type: Type.STRING,
    enum: [...values],
  };
}

export function nul(s: Schema): Schema {
  return {
    ...s,
    nullable: true,
  };
}

export function obj(props: Record<string, Schema>, required?: string[]): Schema {
  return {
    type: Type.OBJECT,
    properties: props,
    required: required ?? Object.keys(props),
  };
}

export function arr(items: Schema, min?: number, max?: number): Schema {
  const s: Schema = {
    type: Type.ARRAY,
    items,
  };
  if (min !== undefined) {
    s.minItems = String(min);
  }
  if (max !== undefined) {
    s.maxItems = String(max);
  }
  return s;
}
