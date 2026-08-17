import { NextResponse } from "next/server";
import { getSessionDbUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";

const MAX_CONSECUTIVE_DAYS_OFF = 30;
const INVALID_VALUE_MESSAGE = "maxConsecutiveDaysOff must be an integer between 0 and 30.";

function invalidValueResponse() {
  return NextResponse.json({ error: INVALID_VALUE_MESSAGE }, { status: 400 });
}

async function parseMaxConsecutiveDaysOff(request: Request): Promise<number | null> {
  try {
    const { maxConsecutiveDaysOff } = (await request.json()) as { maxConsecutiveDaysOff?: unknown };
    return typeof maxConsecutiveDaysOff === "number" &&
      Number.isInteger(maxConsecutiveDaysOff) &&
      maxConsecutiveDaysOff >= 0 &&
      maxConsecutiveDaysOff <= MAX_CONSECUTIVE_DAYS_OFF
      ? maxConsecutiveDaysOff
      : null;
  } catch {
    return null;
  }
}

export async function PATCH(request: Request) {
  const dbUser = await getSessionDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maxConsecutiveDaysOff = await parseMaxConsecutiveDaysOff(request);
  if (maxConsecutiveDaysOff === null) {
    return invalidValueResponse();
  }

  const updatedUser = await prisma.user.update({
    where: { id: dbUser.id },
    data: { maxConsecutiveDaysOff },
    select: { maxConsecutiveDaysOff: true },
  });

  return NextResponse.json(updatedUser);
}
