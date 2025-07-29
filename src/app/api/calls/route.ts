export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { subDays } from "date-fns";
import { User } from "@prisma/client";
import { z } from "zod";

interface Call {
  id: number;
  caller: string;
  called: string;
  intent: string;
  firstname: string;
  lastname: string;
  birthdate: Date;
  createdAt: Date;
  steps: string[];
}

interface UserNumber {
  number: string;
}

const CreateCallSchema = z.object({
  caller: z.string().min(1, "caller is required"),
  called: z.string().min(1, "called is required"),
  intent: z.string().optional(),
  firstname: z.string().nullable(),
  lastname: z.string().nullable(),
  birthdate: z.string().datetime().nullable(),
  createdAt: z.coerce.date(),
  steps: z.array(z.string()),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = request.nextUrl;

    const userId = session?.user.id;

    if (!userId) {
      return NextResponse.json(
        { error: "Access denied. Only connected users can access their calls" },
        { status: 403 }
      );
    }

    const intent = searchParams.get("intent") ?? undefined;
    const daysAgo = Number(searchParams.get("daysAgo")) || 7;

    const userNumbers: UserNumber[] = await prisma.userNumber.findMany({
      where: { userId: session?.user.id },
      select: { number: true },
    });

    const numbers: string[] = userNumbers.map((n) => n.number);

    const calls = await prisma.call.findMany({
      where: {
        called: {
          in: numbers,
        },
        intent,
        createdAt: {
          gte: subDays(new Date(), daysAgo),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(calls, { status: 200 });
  } catch (error) {
    const err = error as Error;
    console.error(err.message);
    return NextResponse.json(
      { error: err.message || "An unknown error occurred." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("secret") !== process.env.API_KEY) {
      return NextResponse.json(
        { error: "Access denied. Please contact support to generate API KEY" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const parseResult = CreateCallSchema.safeParse(body);
    if (!parseResult.success) {
      const validationErrors = parseResult.error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return NextResponse.json(
        { error: "Validation failed", details: validationErrors },
        { status: 400 }
      );
    }

    const {
      caller,
      called,
      intent,
      firstname,
      lastname,
      birthdate,
      createdAt,
      steps,
    } = parseResult.data;
    const newCall = await prisma.call.create({
      data: {
        caller,
        called,
        intent,
        firstname,
        lastname,
        birthdate,
        createdAt,
        steps,
      },
    });

    return NextResponse.json(
      { message: "Call created successfully", product: newCall },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
