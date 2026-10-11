import ZAI from "z-ai-web-dev-sdk";
const zai = await ZAI.create();
for (const url of ["https://docs.lium.io/provider-quickstart", "https://docs.lium.io/"]) {
  try {
    const r = await zai.functions.invoke("page_reader", { url });
    const text = (r?.data?.html ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
    console.log(`\n===== ${url} ===== title: ${r?.data?.title ?? "?"}`);
    console.log(text.slice(0, 3000));
  } catch (e) {
    console.log(`\n===== ${url} ===== ERROR: ${e.message?.slice(0, 100)}`);
  }
}
