export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type EvenTuple<T> =
  | []
  | [T, T]
  | [T, T, ...EvenTuple<T>];