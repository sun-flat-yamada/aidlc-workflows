## Angular verification loop

- After each generated file set, run the project's build, lint and unit-test-with-coverage commands (for an Angular CLI project usually `ng build`, `ng lint` and `ng test --coverage`, or the `npm run` scripts that wrap them) and repeat until all three pass.
- Default coverage thresholds unless the team set others: statements 80, branches 70, functions 80, lines 80.
- Unit tests sit next to the file they test (`<name>.spec.ts`), query elements by `[data-ui-id="..."]`, and cover for every API call the success path, each error kind the binding table handles, and the resulting screen state.
