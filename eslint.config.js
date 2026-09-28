import globals from 'globals';

// Style follows SillyTavern core: 4-space indent, single quotes, semicolons,
// always-multiline trailing commas. Anything ST's own code would trip over is
// deliberately absent so theirs stays clean alongside ours.
export default [
    {
        ignores: ['node_modules/**', '.husky/_/**'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                SillyTavern: 'readonly',
                SlashCommandParser: 'readonly',
                SlashCommand: 'readonly',
                SlashCommandArgument: 'readonly',
                ARGUMENT_TYPE: 'readonly',
                eventSource: 'readonly',
                event_types: 'readonly',
                toastr: 'readonly',
                $: 'readonly',
            },
        },
        rules: {
            indent: ['error', 4, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],
            'comma-dangle': ['error', 'always-multiline'],
            eqeqeq: ['error', 'always'],
            'no-var': 'error',
            'prefer-const': 'error',
            'prefer-arrow-callback': 'error',
            'object-shorthand': 'error',
            'arrow-body-style': ['error', 'as-needed'],
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'no-undef': 'error',
        },
    },
    {
        // node --test
        files: ['test/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.node,
        },
    },
];
