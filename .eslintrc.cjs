module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  globals: {
    game: "readonly",
    foundry: "readonly",
    ui: "readonly",
    Hooks: "readonly",
    Handlebars: "readonly",
    ChatMessage: "readonly",
    Dialog: "readonly",
    Roll: "readonly",
    Die: "readonly",
    CONFIG: "readonly",
    canvas: "readonly",
    $: "readonly"
  },
  rules: {
    "no-shadow": "warn",
    "no-unused-vars": ["warn", { "args": "none" }],
    "no-empty": ["warn", { "allowEmptyCatch": true }]
  }
};
