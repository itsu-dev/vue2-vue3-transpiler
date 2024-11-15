# Vue2 to Vue3 Transpiler (beta)

A Transpiler for Vue2 Applications with [vue-property-decorator](https://github.com/kaorun343/vue-property-decorator) and Vue Class Component.

## Getting Started

```sh
ts-node main.ts <path-to-transpile>
```

## Features

### @Ref, @Prop, @Emit, @Watch migration

vue-property-decorator has four main decorators, `@Ref`, `@Prop`, `@Emit`, `@Watch`. Codes with these decorators will be as shown below:

#### @Ref

```ts
@Ref() protected readonly name!: string;
```

```ts
const name = ref<string>();
```

And if there are `this.$refs.someValue` in the input, then they are also transpiled as shown above.
For example:

```ts
this.$refs.root.innerText = "";
```

```ts
const root = ref(null);
root.value.innerText = "";
```

#### @Prop

```ts
@Prop({ default: "Title", required: false }) private readonly title!: string;
```

```ts
interface Props {
  title?: string,
}

const props = withDefaults(defineProps<Props>(), {
  title: "Title",
});
```

And, all occurences of `@Prop` references are replaced with `props.someValue`.

#### @Emit

```ts
@Emit("closeModal")
public closeModal(arg: string, arg1: number): void {
    return;
} 
```

```ts
interface Emits {
  (e: 'closeModal', arg: string, arg1: number): void,
}

const emit = defineEmits<Emits>();

function closeModal(arg: string, arg1: number): void {
  emit('closeModal', arg, arg1);
}
```

#### @Watch

```ts
@Watch('value')
function onChange(newValue: string, oldValue: string): void {
  console.log(newValue, oldValue);
}
```

```ts
watch('value', (newValue: Popup, oldValue: Popup): void => {
  console.log(newValue, oldValue);
});
```

### Methods migration

Despite methods are main components, they aren't available in NOT class components.
So it is necessary to convert them into functions. This transpiler also supports this.
For example:

```ts
export default class MyInput extends Vue {
    private onChange(event: Event): void {
        console.log(event);
    }
}
```

will be:

```ts
function onChange(event: Event): void {
    console.log(event);
}
```

In class context, `this` indicates its own instance, but in functions, not.
Therefore this transpiler also replace `this` into `''`. For example:

```ts
this.someValue = "";
```

will be:

```ts
someValue = "";
```

## Lifecycle Hooks migration

These lifecycle hooks will be replaced with:

```yaml
beforeMount: onBeforeMount
mounted: onMounted
beforeUpdate: onBeforeUpdate
updated: onUpdated
beforeDestroy: onBeforeUnmount
destroyed: onUnmounted
activated: onActivated
deactivated: onDeactivated
errorCaptured: onErrorCaptured
serverPrefetch: onServerPrefetch
```

For example, `mounted` will be transpiled as:

```ts
private mounted(): void {
  console.log(1);
}
```

```ts
import { onMounted } from 'vue';

onMounted(() => {
  console.log(1);
});
```

On the other hand, statements in `created` and `beforeCreate` will be expanded at the top-level.

## Known issues

- All comments are dropped in transpiled files.
- If there are `@Ref` value whose name is same with identifiers that is used in the file,
such identifiers are replaced with `someIdentifier.value`.
- Also need code formatters: This transpiler does NOT maintain code formats, so you may need additional code formatters such as Prettier.
- Redundant parentheses for expressions.
