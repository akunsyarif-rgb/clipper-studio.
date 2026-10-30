import { describe, expect, it } from "vitest";
import { presign, signHeaders } from "../supabase/functions/media-library/sigv4";

// The examples published in the AWS S3 documentation ("Authenticating Requests: Using Query Parameters" / "Using the Authorization Header").
const AWS = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" };
const AT = new Date("2013-05-24T00:00:00Z");

describe("SigV4", () => {
  it("presigns the documented GET example", async () => {
    const url = await presign(AWS, "GET", "https://examplebucket.s3.amazonaws.com/test.txt", 86400, { now: AT });
    expect(url).toContain("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
    expect(url).toContain("X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request");
  });
  it("signs the documented header-auth GET example (with a Range header)", async () => {
    const h = await signHeaders(AWS, "GET", "https://examplebucket.s3.amazonaws.com/test.txt", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", { range: "bytes=0-9" }, AT);
    expect(h.authorization).toContain("SignedHeaders=host;range;x-amz-content-sha256;x-amz-date");
    expect(h.authorization).toContain("Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
  });
  it("signs the documented GET-with-query example (lifecycle)", async () => {
    const h = await signHeaders(AWS, "GET", "https://examplebucket.s3.amazonaws.com/?lifecycle", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", {}, AT);
    expect(h.authorization).toContain("Signature=fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543");
  });
});
