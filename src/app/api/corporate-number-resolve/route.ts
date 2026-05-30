import { NextResponse } from "next/server";
import { normalizeApplicationTarget } from "@/lib/application-target";
import { resolveCorporateNumberFromNta } from "@/lib/corporate-number-resolver";
import type { CompanyResearchRequest } from "@/types/sidus";

type CorporateNumberResolveRequest = CompanyResearchRequest & {
  headquarters?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CorporateNumberResolveRequest;
    const applicationTarget = normalizeApplicationTarget(body.applicationTarget);

    if (!applicationTarget.companyName.trim()) {
      return NextResponse.json(
        {
          error: "applicationTarget.companyName is required",
          code: "company_name_required",
        },
        { status: 400 },
      );
    }

    const result = await resolveCorporateNumberFromNta({
      applicationTarget,
      headquarters: body.headquarters,
    });

    return NextResponse.json({
      ...result,
      notice:
        "このサービスは、国税庁法人番号システムのWeb-API機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invalid corporate number resolve request",
        code: "corporate_number_resolve_failed",
      },
      { status: 400 },
    );
  }
}
