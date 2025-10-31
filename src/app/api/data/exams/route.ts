import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import Papa from "papaparse"; // CSV parser

export async function GET() {
  // Locate your CSV file in the /public directory
  const filePath = path.join(process.cwd(), "public", "mock-datas.csv");

  // Read the CSV file
  const fileData = fs.readFileSync(filePath, "utf8");

  // Parse the CSV data into JSON
  const parsed = Papa.parse(fileData, { header: true });
  console.log("test");

  // Return the parsed data as JSON
  return NextResponse.json(parsed.data);
}