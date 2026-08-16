import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  cookieAdapter: undefined as
    | {
        getAll(): Array<{ name: string; value: string }>;
        setAll(
          cookies: Array<{
            name: string;
            value: string;
            options?: { httpOnly?: boolean; path?: string };
          }>
        ): void;
      }
    | undefined,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

import { updateSession } from "./session";

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    mocks.createServerClient.mockImplementation(
      (_url: string, _key: string, options: { cookies: typeof mocks.cookieAdapter }) => {
        mocks.cookieAdapter = options.cookies;
        return { auth: { getUser: mocks.getUser } };
      }
    );
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes request cookies to Supabase while validating the session", async () => {
    const request = new NextRequest("https://hub.example/dashboard", {
      headers: { cookie: "session=old; theme=dark" },
    });
    mocks.getUser.mockImplementation(async () => {
      expect(mocks.cookieAdapter?.getAll()).toEqual(
        expect.arrayContaining([
          { name: "session", value: "old" },
          { name: "theme", value: "dark" },
        ])
      );
      return { data: { user: { id: "auth-user-1" } }, error: null };
    });

    const response = await updateSession(request);

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "publishable-key",
      expect.objectContaining({ cookies: expect.any(Object) })
    );
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(response.headers.get("x-middleware-request-cookie")).toContain("session=old");
    expect(response.headers.get("x-middleware-override-headers")).toContain("cookie");
  });

  it("writes refreshed cookies to both the continued request and response", async () => {
    const request = new NextRequest("https://hub.example/dashboard");
    mocks.getUser.mockImplementation(async () => {
      mocks.cookieAdapter?.setAll([
        {
          name: "session",
          value: "refreshed",
          options: { httpOnly: true, path: "/" },
        },
      ]);
      return { data: { user: { id: "auth-user-1" } }, error: null };
    });

    const response = await updateSession(request);

    expect(request.cookies.get("session")?.value).toBe("refreshed");
    expect(response.cookies.get("session")?.value).toBe("refreshed");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "session=refreshed"
    );
  });
});
