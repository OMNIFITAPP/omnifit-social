// Instagram publishing through the Meta Graph API. No dependencies.
//
// Two rules learned the hard way elsewhere and kept here:
//   1. Every container is waited on before it is published. Skipping the wait on
//      the single-image path is what once lost a post to error 9007.
//   2. A published post cannot be edited or deleted through the API. Nothing is
//      published that a person has not approved.

const GRAPH = "https://graph.facebook.com/v23.0";

function token() {
  const t = process.env.IG_ACCESS_TOKEN;
  if (!t) throw new Error("IG_ACCESS_TOKEN is not set");
  return t;
}

async function graph(method, path, params = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: token() });
  let res;
  if (method === "GET") {
    url.search = body.toString();
    res = await fetch(url);
  } else {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`Graph ${res.status}: ${e.message || res.statusText} (code ${e.code ?? "?"})`);
  }
  return json;
}

/** The account id, from the environment or discovered from the token. */
export async function userId() {
  if (process.env.IG_USER_ID) return process.env.IG_USER_ID;
  const pages = await graph("GET", "me/accounts", {
    fields: "name,instagram_business_account{id,username}",
  });
  const page = (pages.data || []).find((p) => p.instagram_business_account?.id);
  if (!page) {
    throw new Error(
      "No Instagram business account is linked to a Page this token can see. " +
      "See INSTAGRAM-RUNBOOK.md steps 2 to 4."
    );
  }
  return page.instagram_business_account.id;
}

/** Verify the token and report which account it publishes to. */
export async function whoami() {
  const id = await userId();
  const me = await graph("GET", id, { fields: "username,name" });
  return { id, ...me };
}

async function waitForContainer(id, { tries = 30, delayMs = 5000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const out = await graph("GET", id, { fields: "status_code,status" });
    if (out.status_code === "FINISHED") return;
    if (out.status_code === "ERROR") throw new Error(`Container ${id} failed: ${out.status || "ERROR"}`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Container ${id} was still not ready after ${tries} checks`);
}

async function publishContainer(id, creationId) {
  const out = await graph("POST", `${id}/media_publish`, { creation_id: creationId });
  const media = await graph("GET", out.id, { fields: "permalink" });
  return { mediaId: out.id, permalink: media.permalink };
}

/** One image. */
export async function publishImage(imageUrl, caption) {
  const id = await userId();
  const c = await graph("POST", `${id}/media`, { image_url: imageUrl, caption });
  await waitForContainer(c.id);
  return publishContainer(id, c.id);
}

/** Two to ten images as a carousel. */
export async function publishCarousel(imageUrls, caption) {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`A carousel takes 2 to 10 images, got ${imageUrls.length}`);
  }
  const id = await userId();
  const children = [];
  for (const image_url of imageUrls) {
    const child = await graph("POST", `${id}/media`, { image_url, is_carousel_item: "true" });
    await waitForContainer(child.id);
    children.push(child.id);
  }
  const c = await graph("POST", `${id}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption,
  });
  await waitForContainer(c.id);
  return publishContainer(id, c.id);
}
