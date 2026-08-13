import { lua, lauxlib, lualib, to_jsstring, to_luastring, type LuaState } from "fengari";

export class LuaHarness {
  private readonly state: LuaState;

  constructor() {
    this.state = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(this.state);
  }

  run(source: string): void {
    const status = lauxlib.luaL_dostring(this.state, to_luastring(source));
    if (status === lua.LUA_OK) return;

    const message = to_jsstring(lua.lua_tolstring(this.state, -1));
    lua.lua_pop(this.state, 1);
    throw new Error(message);
  }

  boolean(expression: string): boolean {
    this.run(`__test_result = (${expression})`);
    lua.lua_getglobal(this.state, to_luastring("__test_result"));
    const result = Boolean(lua.lua_toboolean(this.state, -1));
    lua.lua_pop(this.state, 1);
    return result;
  }

  number(expression: string): number {
    this.run(`__test_result = (${expression})`);
    lua.lua_getglobal(this.state, to_luastring("__test_result"));
    const result = lua.lua_tonumber(this.state, -1);
    lua.lua_pop(this.state, 1);
    return result;
  }

  string(expression: string): string {
    this.run(`__test_result = (${expression})`);
    lua.lua_getglobal(this.state, to_luastring("__test_result"));
    const result = to_jsstring(lua.lua_tolstring(this.state, -1));
    lua.lua_pop(this.state, 1);
    return result;
  }

  close(): void {
    lua.lua_close(this.state);
  }
}

export function luaString(value: string): string {
  return JSON.stringify(value);
}
