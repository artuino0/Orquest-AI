/// <reference types="vite/client" />
/// <reference path="../../preload/api.d.ts" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
