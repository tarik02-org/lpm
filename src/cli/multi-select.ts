import { autocompleteMultiselect, isCancel } from "@clack/prompts";
import type { Option } from "@clack/prompts";
import * as Effect from "effect/Effect";

import { InteractivePromptError } from "../error.ts";

export interface MultiSelectOption<Value> {
  readonly value: Value;
  readonly label: string;
  readonly hint: string | undefined;
  readonly disabled: boolean;
}

export interface MultiSelectInput<Value> {
  readonly message: string;
  readonly placeholder: string;
  readonly options: ReadonlyArray<MultiSelectOption<Value>>;
}

export const selectMany = Effect.fn("Cli.selectMany")(function* <Value>(
  input: MultiSelectInput<Value>,
) {
  const options = input.options.map((option, index) => {
    const promptOption: Option<number> = {
      value: index,
      label: option.label,
    };
    if (option.hint !== undefined) {
      promptOption.hint = option.hint;
    }
    if (option.disabled) {
      promptOption.disabled = true;
    }
    return promptOption;
  });

  const selected = yield* Effect.tryPromise({
    try: (signal) =>
      autocompleteMultiselect<number>({
        message: input.message,
        placeholder: input.placeholder,
        maxItems: 10,
        options,
        filter: (search, option) => {
          const normalizedSearch = search.toLocaleLowerCase();
          return (
            option.label?.toLocaleLowerCase().includes(normalizedSearch) === true ||
            option.hint?.toLocaleLowerCase().includes(normalizedSearch) === true
          );
        },
        signal,
      }),
    catch: (cause) => new InteractivePromptError({ cause }),
  });

  if (isCancel(selected)) {
    return [];
  }

  const values: Array<Value> = [];
  for (const index of selected) {
    const option = input.options[index];
    if (option !== undefined) {
      values.push(option.value);
    }
  }
  return values;
});
