declare module "fengari" {
  export type LuaState = object;

  export const lua: {
    LUA_OK: number;
    lua_close(state: LuaState): void;
    lua_getglobal(state: LuaState, name: Uint8Array): number;
    lua_pop(state: LuaState, count: number): void;
    lua_toboolean(state: LuaState, index: number): number;
    lua_tonumber(state: LuaState, index: number): number;
    lua_tolstring(state: LuaState, index: number): Uint8Array;
  };

  export const lauxlib: {
    luaL_dostring(state: LuaState, source: Uint8Array): number;
    luaL_newstate(): LuaState;
  };

  export const lualib: {
    luaL_openlibs(state: LuaState): void;
  };

  export function to_jsstring(value: Uint8Array): string;
  export function to_luastring(value: string): Uint8Array;
}
