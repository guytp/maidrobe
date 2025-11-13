module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'eslint --fix',
    'prettier --write',
    () => 'npm run typecheck --workspace=mobile',
    () => 'npm run test --workspace=mobile',
  ],
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
