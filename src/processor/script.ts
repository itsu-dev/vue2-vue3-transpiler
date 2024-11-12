import {SFCBlock} from "vue-sfc-parser";

import { parseForESLint } from '@typescript-eslint/parser';
import {TSESTree} from '@typescript-eslint/types';

/** Quote **/
const Q = '\'';

/** Semicolon **/
const SC = ';';

/** Interface or Type delimiter **/
const IF_DELIMITER = ',';

/** Not allowed imports **/
const NOT_ALLOWED_IMPORTS = ["VueBase.vue", "vue-property-decorator"];

/** Todo message **/
const TODO_MESSAGE = 'TODO: 自動変換失敗';

const LIFECYCLES: Record<string, string> = {
    'beforeCreate': 'onBeforeMount',
    'created': 'onMounted',
    'beforeMount': 'onBeforeMount',
    'mounted': 'onMounted',
    'beforeUpdate': 'onBeforeUpdate',
    'updated': 'onUpdated',
    'beforeDestroy': 'onBeforeUnmount',
    'destroyed': 'onUnmounted',
    'activated': 'onActivated',
    'deactivated': 'onDeactivated',
    'errorCaptured': 'onErrorCaptured',
    'serverPrefetch': 'onServerPrefetch',
};

type VueRef = {
    type: string;
    value?: TSESTree.Expression;
}

type VueProp = {
    type: string;
    required?: TSESTree.Expression;
    default?: TSESTree.Expression;
}

type VueComputed = {
    get: TSESTree.Statement[];
    set?: TSESTree.Statement[];
}

export default function processScript(block: SFCBlock): string {
    let result = "";

    const lifecycleHooks: string[] = [];
    const refs: Record<string, VueRef> = {};
    const props: Record<string, VueProp> = {};
    const computeds: Record<string, VueComputed> = {};
    const watches: Record<string, TSESTree.Expression> = {};
    const emits: Record<string, TSESTree.Expression> = {};

    function returnStmt(stmt: TSESTree.ReturnStatement): string {
        let script = "return";

        if (stmt.argument) {
            script += ` ${expr(stmt.argument)}`;
        }

        script += SC;

        return script;
    }

    function importStmt(stmt: TSESTree.ImportDeclaration) {
        // Check if the import is allowed
        if (NOT_ALLOWED_IMPORTS.includes(stmt.source.value.split('/').at(-1)!)) {
            return;
        }

        const notDefaultSpecifiers = stmt.specifiers
            .filter(specifier => specifier.type === 'ImportSpecifier')
            .map(specifier => specifier.local.name);

        const defaultSpecifier = stmt.specifiers.find(specifier => specifier.type === 'ImportDefaultSpecifier');

        let script = 'import';
        if (defaultSpecifier) {
            script += ` ${defaultSpecifier.local.name}`;
        }

        if (notDefaultSpecifiers.length > 0) {
            if (defaultSpecifier) {
                script += ',';
            }
            script += ` {${notDefaultSpecifiers.join(', ')}}`;
        }

        script += ` from ${Q}${stmt.source.value}${Q}${SC}\n`;

        return script;
    }

    /** Literal **/
    function literal(literal: TSESTree.Literal) {
        return literal.raw;
    }

    /** Identifier **/
    function identifier(identifier: TSESTree.Identifier) {
        // if the identifier is a ref, return the value of the ref
        let script = Object.keys(refs).includes(identifier.name)
            ? `${identifier.name}.value`
            : identifier.name;

        if (identifier.typeAnnotation) {
            script += `: ${typeName(identifier.typeAnnotation.typeAnnotation)}`;
        }

        return script;
    }

    /** MemberExpression **/
    function member(member: TSESTree.MemberExpression): string {
        if (member.object.type === 'ThisExpression') {
            return `${expr(member.property as TSESTree.Expression)}`;
        }
        return `${expr(member.object)}.${expr(member.property as TSESTree.Expression)}`;
    }

    /** BinaryExpression **/
    function binary(binaryExpr: TSESTree.BinaryExpression): string {
        // TODO: paren...
        const left = expr(binaryExpr.left as TSESTree.Expression);
        const right = expr(binaryExpr.right as TSESTree.Expression);
        return `(${left} ${binaryExpr.operator} ${right})`;
    }

    /** ObjectExpression **/
    function object(objectExpr: TSESTree.ObjectExpression): string {
        const properties = objectExpr.properties.map((property) => {
            const key = expr((property as TSESTree.Property).key);
            const value = expr((property as TSESTree.Property).value as TSESTree.Expression);
            return `${key}: ${value}`;
        });
        return `{\n${properties.join(',\n')}}`;
    }

    /** ConditionalExpression **/
    function conditional(conditionalExpr: TSESTree.ConditionalExpression): string {
        const test = expr(conditionalExpr.test);
        const consequent = expr(conditionalExpr.consequent);
        const alternate = expr(conditionalExpr.alternate);
        return `${test} ? ${consequent} : ${alternate}`;
    }

    /** CallExpression **/
    function call(callExpr: TSESTree.CallExpression): string {
        // append a callee
        // abc.callee(args0, args1);
        // ^^^^^^^^^^^ here
        let script = expr(callExpr.callee);
        script += '(';

        if (callExpr.arguments.length > 0) {
            callExpr.arguments.forEach((arg, index) => {
                if (arg.type !== 'SpreadElement') {
                    // append an argument
                    // abc.callee(args0, args1);
                    //               ^^^^ here
                    script += expr(arg);
                } else {
                    // append a spread argument
                    // abc.callee(args0, ...args1);
                    //               ^^^^^^^^ here
                    script += '...';
                    script += expr(arg.argument as TSESTree.Expression);
                }

                // append a comma
                // abc.callee(args0, args1);
                //                    ^^ here
                if (index < callExpr.arguments.length - 1) {
                    script += ', ';
                }
            });
        }

        // append a )
        // abc.callee(args0, args1);
        //                        ^^ here
        script += `)`;

        return script;
    }

    /** AssignmentExpression **/
    function assignment(assignmentExpr: TSESTree.AssignmentExpression): string {
        // append a left
        // left = right;
        // ^^^^ here
        let script = expr(assignmentExpr.left as TSESTree.Expression);

        // append an operator
        // left = right;
        //      ^ here
        script += ` ${assignmentExpr.operator} `;

        // append a right
        // left = right;
        //          ^^^^ here
        script += expr(assignmentExpr.right as TSESTree.Expression);

        return script;
    }

    /** ArrowFunctionExpression **/
    function arrowFunction(arrowFunctionExpr: TSESTree.ArrowFunctionExpression): string {
        let script = '';
        script += '(';

        if (arrowFunctionExpr.params.length > 0) {
            arrowFunctionExpr.params.forEach((param, index) => {
                // append a parameter name
                // (a, b) => ...
                //  ^ here
                script += expr(param as TSESTree.Expression);

                // append a comma
                // (a, b) => ...
                //     ^^ here
                if (index < arrowFunctionExpr.params.length - 1) {
                    script += ', ';
                }
            });
        }

        // append a )
        // (a, b) => ...
        //           ^ here
        script += ') => ';

        // append a body
        // (a, b) => { return ...; }
        //               ^^^^^^^^^^ here
        if (arrowFunctionExpr.body.type === 'BlockStatement') {
            script += '{\n';
            (arrowFunctionExpr.body.body as TSESTree.Statement[]).forEach((s) => {
                script += `  ${stmt(s)}\n`;
            });
            script += '}';
        } else {
            script += expr(arrowFunctionExpr.body as TSESTree.Expression);
        }

        return script;
    }

    /** UnaryExpression **/
    function unary(unaryExpr: TSESTree.UnaryExpression): string {
        console.log(unaryExpr)
        return `${unaryExpr.operator}${expr(unaryExpr.argument)}`;
    }

    /** UpdateExpression **/
    function updateExpr(updateExpr: TSESTree.UpdateExpression): string {
        return `${expr(updateExpr.argument)}${updateExpr.operator}`;
    }

    /**
     * Process an expression
     **/
    function expr(e: TSESTree.Expression): string {
        switch (e.type) {
            case 'Literal':
                return literal(e as TSESTree.Literal);
            case 'Identifier':
                return identifier(e as TSESTree.Identifier);
            case 'MemberExpression':
                return member(e as TSESTree.MemberExpression);
            case 'ThisExpression':
                return '';
            case 'BinaryExpression':
                return binary(e as TSESTree.BinaryExpression);
            case 'ObjectExpression':
                return object(e as TSESTree.ObjectExpression);
            case 'ConditionalExpression':
                return conditional(e as TSESTree.ConditionalExpression);
            case 'CallExpression':
                return call(e as TSESTree.CallExpression);
            case 'AssignmentExpression':
                return assignment(e as TSESTree.AssignmentExpression);
            case 'ArrowFunctionExpression':
                return arrowFunction(e as TSESTree.ArrowFunctionExpression);
            case 'UnaryExpression':
                return unary(e as TSESTree.UnaryExpression);
            case 'UpdateExpression':
                return updateExpr(e as TSESTree.UpdateExpression);
            default:
                return `/* ${TODO_MESSAGE} */`;
        }
    }

    /**
     * Convert a type node to a specific type name
     **/
    function typeName(typeNode: TSESTree.TypeNode): string {
        switch (typeNode.type) {
            case 'TSStringKeyword':
                return 'string';
            case 'TSNumberKeyword':
                return 'number';
            case 'TSBooleanKeyword':
                return 'boolean';
            case 'TSObjectKeyword':
                return 'object';
            case 'TSVoidKeyword':
                return 'void';
            case 'TSNullKeyword':
                return 'null';
            case 'TSUndefinedKeyword':
                return 'undefined';
            case 'TSAnyKeyword':
                return 'any';
            case 'TSArrayType':
                return typeName(typeNode.elementType) + '[]';
            case 'TSTypeReference':
                return (typeNode.typeName as TSESTree.Identifier).name;
            case 'TSUnionType':
                return typeNode.types.map(typeName).join(' | ');
            case 'TSIntersectionType':
                return typeNode.types.map(typeName).join(' & ');
            case 'TSLiteralType':
                return literal(typeNode.literal as TSESTree.Literal);
            case 'TSTypeOperator':
                return typeNode.operator + ' ' + typeName(typeNode.typeAnnotation!);
            default:
                return `any /* ${TODO_MESSAGE} */`;
        }
    }

    function objectToExprRecord(objectExpr: TSESTree.ObjectExpression): Record<string, TSESTree.Expression> {
        const record: Record<string, TSESTree.Expression> = {};
        objectExpr.properties.forEach(property => {
            const key = expr((property as TSESTree.Property).key);
            record[key] = (property as TSESTree.Property).value as TSESTree.Expression;
        });
        return record;
    }

    /**
     * Convert a wrapper type to a primitive type
     * @param type
     */
    function boxPrimitiveType(type: string): string {
        switch (type) {
            case 'String':
                return 'string';
            case 'Number':
                return 'number';
            case 'Boolean':
                return 'boolean';
            default:
                return type;
        }
    }

    function propertyDefinitionStmt(stmt: TSESTree.PropertyDefinition): string | undefined {
        /**
         * Check if the property is a @Ref
         */
        const isRef = () => {
            return stmt.decorators?.some(decorator => decorator.expression.type === 'CallExpression' && expr(decorator.expression.callee as TSESTree.Expression) === 'Ref');
        }

        /**
         * Check if the property is a @Prop
         */
        const isProp = () => {
            return stmt.decorators?.some(decorator => decorator.expression.type === 'CallExpression' && expr(decorator.expression.callee as TSESTree.Expression) === 'Prop');
        }

        // process later
        if (isRef()) {
            refs[expr(stmt.key as TSESTree.Expression)] = {
                type: expr((stmt.typeAnnotation?.typeAnnotation as TSESTree.TSTypeReference).typeName as TSESTree.Expression),
                value: (stmt.value as TSESTree.Expression | null) ?? undefined
            };
            return undefined;
        }

        // process later
        if (isProp()) {
            const argsObj = objectToExprRecord((stmt.decorators[0].expression as TSESTree.CallExpression).arguments[0] as TSESTree.ObjectExpression) as Record<keyof VueProp, TSESTree.Expression>
            props[expr(stmt.key as TSESTree.Expression)] = {
                type: boxPrimitiveType((argsObj.type as TSESTree.Identifier).name),
                required: argsObj.required,
                default: argsObj.default
            }
            return undefined;
        }

        // create a variable declaration line
        // const(let) name: Type = Expr;
        // ^^^^^^^^^^ here
        let script = stmt.readonly ? 'const ' : 'let ';

        // append a name
        // const name: Type = Expr;
        //       ^^^^ here
        script += expr(stmt.key as TSESTree.Expression);

        // append a type annotation
        // const name: Type = Expr;
        //           ^^^^^^ here
        if (stmt.typeAnnotation?.typeAnnotation) {
            script += ': ';
            script += typeName(stmt.typeAnnotation.typeAnnotation);
        }

        // append an initializer
        // const name: Type = Expr;
        //                    ^^^^ here
        if (stmt.value) {
            script += ' = ';
            script += expr(stmt.value);
        }

        // append a Semicolon
        // const name: Type = Expr;
        //                        ^ here
        script += SC;
        script += '\n';

        return script;
    }

    /**
     * Process a method definition
     * NOTE: A method definition will be converted to a function definition
     * because the result Vue SFC is not a class component.
     * @param stmt
     */
    function methodDefinitionStmt(methodDefinitionStmt: TSESTree.MethodDefinition): string | undefined {
        let script = '';
        const name = expr(methodDefinitionStmt.key as TSESTree.Expression);

        // check if the method is a lifecycle hook
        if (Object.keys(LIFECYCLES).includes(name)) {
            lifecycleHooks.push(LIFECYCLES[name]);

            script += `${LIFECYCLES[name]}(() => {\n`;
            (methodDefinitionStmt.value.body?.body ?? []).forEach((s) => {
                script += `  ${stmt(s)}\n`;
            });
            script += `})${SC}\n\n`;

            return script;
        }

        // check if the method is a computed property
        if (methodDefinitionStmt.kind === 'get') {
            const body = methodDefinitionStmt.value.body?.body ?? [];
            if (!computeds[name]) {
                computeds[name] = {
                    get: body,
                };
            } else {
                computeds[name].get = body;
            }
            return undefined;
        }

        if (methodDefinitionStmt.kind === 'set') {
            const body = methodDefinitionStmt.value.body?.body ?? [];
            if (!computeds[name]) {
                computeds[name] = {
                    get: [],
                    set: body,
                };
            } else {
                computeds[name].set = body;
            }
            return undefined;
        }

        // append a function keyword
        // function name(a: Type, b: Type): Type {
        // ^^^^^^^^ here
        script += "function ";

        // append a name and (
        // function name(a: Type, b: Type): Type {
        //          ^^^^^ here
        script += name;
        script += '(';

        if (methodDefinitionStmt.value.params.length > 0) {
            methodDefinitionStmt.value.params.forEach((_param, index) => {
                const param = _param as TSESTree.Identifier;
                // append a parameter name
                // function name(a: Type, b: Type): Type {
                //               ^ here
                script += param.name;

                // append a type annotation
                // function name(a: Type, b: Type): Type {
                //                ^^^^^^ here
                if (param.typeAnnotation?.typeAnnotation) {
                    script += ': ';
                    script += typeName(param.typeAnnotation.typeAnnotation);
                }

                // append a comma
                // function name(a: Type, b: Type): Type {
                //                      ^^ here
                if (index < methodDefinitionStmt.value.params.length - 1) {
                    script += ', ';
                }
            });
        }

        // append a ) and {
        // function name(a: Type, b: Type): Type {
        //                               ^ here
        script += ')';

        // append a return type annotation
        // function name(a: Type, b: Type): Type {
        //                                ^^^^^^ here
        if (methodDefinitionStmt.value.returnType) {
            script += ': ';
            script += typeName(methodDefinitionStmt.value.returnType.typeAnnotation);
        }

        // append a {
        // function name(a: Type, b: Type): Type {
        //                                      ^^ here
        script += ' {\n';

        // process a body
        // function name(a: Type, b: Type) {
        //   // here
        // }
        (methodDefinitionStmt.value.body?.body ?? []).forEach((s) => {
            script += `  ${stmt(s)}\n`;
        });

        // append a }
        // function name(a: Type, b: Type) {
        //   // ...
        // }
        // ^ here
        script += '}\n\n';

        return script;
    }

    /**
     * Process an export default statement
     * export default class SomeClass {
     *    // here
     * }
     *
     * NOTE: assuming that the default export is a class because this file is a Vue SFC.
     * @param stmt
     */
    function exportDefaultStmt(stmt: TSESTree.ExportDefaultDeclaration) {
        const classStmt = stmt.declaration as TSESTree.ClassDeclaration;
        const classElementStmts = classStmt.body.body;
        let script = '';
        classElementStmts.forEach((stmt) => {
            const result = classElementStmt(stmt);
            if (result) {
                script += result;
            }
        });

        return script;
    }

    /**
     * Process a class element
     * class SomeClass {
     *     // here
     * }
     * @param stmt
     */
    function classElementStmt(stmt: TSESTree.ClassElement): string | undefined {
        switch (stmt.type) {
            case 'MethodDefinition':
                return methodDefinitionStmt(stmt as TSESTree.MethodDefinition);
            case 'PropertyDefinition':
                return propertyDefinitionStmt(stmt as TSESTree.PropertyDefinition);
        }
    }

    /**
     * Process an expression statement
     * @param e
     */
    function exprStmt(e: TSESTree.Expression): string {
        return `${expr(e)}${SC}`;
    }

    /**
     * Process a variable declaration statement
     * const a = 1;
     * ^^^^^^^^^^^^ here
     * @param stmt
     */
    function variableDeclarationStmt(stmt: TSESTree.VariableDeclaration): string {
        let script = `${stmt.kind} `;

        stmt.declarations.forEach((decl, index) => {
            script += `${expr(decl.id as TSESTree.Expression)}`;

            if (decl.init) {
                script += ` = ${expr(decl.init)}`;
            }

            if (index < stmt.declarations.length - 1) {
                script += ', ';
            }
        });

        script += SC;

        return script;
    }

    /**
     * Process an if statement
     * if (expr) {
     *     // here
     * }
     * @param stmt
     */
    function ifStmt(s: TSESTree.IfStatement): string {
        let script = `if (${expr(s.test)}) `;

        script += stmt(s.consequent);

        if (s.alternate) {
            script = script.slice(0, -2);
            script += ' else ';
            script += stmt(s.alternate);
        }

        return script;
    }

    /**
     * Process a block statement
     * {
     *     // here
     * }
     * @param stmt
     */
    function blockStmt(s: TSESTree.BlockStatement): string {
        let script = '{\n';

        s.body.forEach((st) => {
            script += `  ${stmt(st)}\n`;
        });

        script += '}';

        return script;
    }

    /**
     * Process a while statement
     * while (expr) {
     *     // here
     * }
     * @param stmt
     */
    function whileStmt(s: TSESTree.WhileStatement): string {
        let script = `while (${expr(s.test)}) `;
        script += stmt(s.body);
        return script;
    }

    /**
     * Process a for statement
     * for (init; test; update) {
     *     // here
     * }
     * @param stmt
     */
    function forStmt(s: TSESTree.ForStatement): string {
        // append a for keyword and (
        // for (init; test; update) {
        // ^^^^^ here
        let script = `for (`;

        if (s.init) {
            // append a for initializer
            // for (init; test; update) {
            //      ^^^^^^ here
            if (s.init.type.endsWith('Declaration')) {
                script += `${stmt(s.init as TSESTree.Statement)} `;
            } else {
                script += `${expr(s.init as TSESTree.Expression)}; `;
            }
        } else {
            script += '; ';
        }

        // append a for tester
        // for (init; test; update) {
        //            ^^^^^^ here
        script += s.test ? `${expr(s.test)}; ` : '; ';

        // append a for updater
        // for (init; test; update) {
        //                  ^^^^^^^^ here
        script += s.update ? `${expr(s.update)}) ` : ') ';

        // append a for body
        // for (init; test; update) {
        //   //  here
        // }
        script += stmt(s.body);

        return script;
    }

    /**
     * Process a for of statement
     * for (const item of items) {
     *     // here
     * }
     * @param stmt
     */
    function forOfOrInStmt(s: TSESTree.ForOfStatement | TSESTree.ForInStatement, isOf: boolean): string {
        // append a for keyword and (
        // for (const item of items) {
        // ^^^^^ here
        let script = `for (`;

        // append a for initializer
        // for (const item of items) {
        //      ^^^^^^ here
        if (s.left.type.endsWith('Declaration')) {
            script += `${stmt(s.left as TSESTree.Statement).slice(0, -1)} `;
        } else {
            script += `${expr(s.left as TSESTree.Expression)} `;
        }

        // append a for of and right expr
        // for (const item of items) {
        //                 ^^^ here
        script += `${isOf ? 'of' : 'in'} ${expr(s.right)}) `;

        // append a for body
        // for (const item of items) {
        //   //  here
        // }
        script += stmt(s.body);

        return script;
    }

    /**
     * Process a statement
     * {
     *     someStatements;
     *     ^^^^^^^^^^^^^^^ here
     * }
     * @param stmt
     */
    function stmt(stmt: TSESTree.Statement): string {
        let script: string | undefined;
        switch (stmt.type) {
            case 'ImportDeclaration':
                script = importStmt(stmt as TSESTree.ImportDeclaration);
                break;
            case 'ExportDefaultDeclaration':
                script = exportDefaultStmt(stmt as TSESTree.ExportDefaultDeclaration);
                break;
            case 'ReturnStatement':
                script = returnStmt(stmt as TSESTree.ReturnStatement);
                break;
            case 'ExpressionStatement':
                script = exprStmt((stmt as TSESTree.ExpressionStatement).expression);
                break;
            case 'VariableDeclaration':
                script = variableDeclarationStmt(stmt as TSESTree.VariableDeclaration);
                break;
            case 'IfStatement':
                script = ifStmt(stmt as TSESTree.IfStatement);
                break;
            case 'BlockStatement':
                script = blockStmt(stmt as TSESTree.BlockStatement);
                break;
            case 'WhileStatement':
                script = whileStmt(stmt as TSESTree.WhileStatement);
                break;
            case 'ForStatement':
                script = forStmt(stmt as TSESTree.ForStatement);
                break;
            case 'ForOfStatement':
                script = forOfOrInStmt(stmt as TSESTree.ForOfStatement, true);
                break;
            case 'ForInStatement':
                script = forOfOrInStmt(stmt as TSESTree.ForInStatement, false);
                break;
            default:
                script = `// ${TODO_MESSAGE}`;
        }

        return script ?? '';
    }

    function insertUnderImports(insertLines: string[]) {
        const lines = result.split('\n');
        const lastImportIndex = [...lines].reverse().findIndex((line) => line.startsWith("import"));

        const importLines = lines.slice(0, lines.length - lastImportIndex);
        const restLines = lines.slice(lines.length - lastImportIndex, lines.length);

        result = importLines.concat(insertLines, restLines).join('\n');
    }

    /**
     * Insert Vue imports
     * ex) import { ref, defineProps, withDefaults } from 'vue';
     */
    function insertVueImports() {
        let tokens: string[] = [...lifecycleHooks];

        if (Object.keys(refs).length > 0) {
            tokens.push('ref');
        }

        if (Object.keys(computeds).length > 0) {
            tokens.push('computed');
        }

        // if (Object.keys(props).length > 0) {
        //     tokens.push('defineProps');
        // }
        //
        // if (Object.values(props).filter((prop) => prop.default != null).length > 0) {
        //     tokens.push('withDefaults');
        // }

        if (tokens.length > 0) {
            const newLine = `import { ${tokens.join(', ')} } from 'vue';`;
            insertUnderImports([newLine]);
        }
    }

    /** Insert computed **/
    function insertComputeds() {
        if (Object.keys(computeds).length === 0) {
            return;
        }

        const newLines: string[] = [];
        Object.entries(computeds).forEach(([key, value]) => {
            newLines.push(`const ${key} = computed({`);
            newLines.push(`  get: () => {`);
            value.get.forEach((s) => {
                newLines.push(`    ${stmt(s)}`);
            });

            if (value.set) {
                newLines.push(`  },`);
                newLines.push(`  set: (value) => {`);
                value.set.forEach(stmt => {
                    newLines.push(`    ${stmt}`);
                });
                newLines.push(`  }`);
            } else {
                newLines.push(`  }`);
            }
            newLines.push(`})${SC}`);
            newLines.push('');
        });

        insertUnderImports(newLines);
    }

    /** Insert ref<>() **/
    function insertRefs() {
        if (Object.keys(refs).length === 0) {
            return;
        }

        const newLines: string[] = [];
        Object.entries(refs).forEach(([key, value]) => {
            let line = `const ${key} = ref<${value.type}>(${value.value ? expr(value.value) : ''});`;
            newLines.push(line);
        });

        newLines.push('');

        insertUnderImports(newLines);
    }

    /** Insert props **/
    function insertProps() {
        if (Object.keys(props).length === 0) {
            return;
        }

        const newLines: string[] = ['interface Props {'];

        Object.entries(props).forEach(([key, value]) => {
            let line = `  ${key}`;
            if (!value.required || expr(value.required) === 'false') {
                line += '?';
            }

            line += `: ${value.type}${IF_DELIMITER}`;

            newLines.push(line);
        });

        newLines.push('}');
        newLines.push('');

        const propsHasDefaults = Object.entries(props).filter(([_, value]) => value.default !== undefined);
        if (propsHasDefaults.length > 0) {
            newLines.push('const props = withDefaults(defineProps<Props>(), {');
            propsHasDefaults.forEach(([key, value]) => {
                let line = `  ${key}: ${expr(value.default!)},`;
                newLines.push(line);
            });
            newLines.push(`})${SC}`);
        } else {
            newLines.push('const props = defineProps<Props>();');
        }

        newLines.push('');

        insertUnderImports(newLines);
    }

    /** Tiny Prettier **/
    function prettier() {
        insertUnderImports(['']);
    }

    // process each lines
    const stmts = parseForESLint(block.content).ast.body;
    stmts.forEach((s) => {
        const text = stmt(s);
        if (text) {
            result += text;
        }
    });

    // insert ref, props and necessary imports.
    insertVueImports();
    insertComputeds();
    insertRefs();
    insertProps();

    // prettier
    prettier();

    let document = '<script setup';

    // Add attributes
    Object.entries(block.attrs).forEach(([key, value]) => {
        if (value === true) {
            document += ` ${key}`;
        } else {
            document += ` ${key}="${value}"`;
        }
    });

    document += '>\n';
    document += result;
    document += '\n</script>';

    return document;
}