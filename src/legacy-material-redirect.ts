const materialId = new URLSearchParams(window.location.search).get("id");
const route = materialId ? `/materials/${encodeURIComponent(materialId)}` : "/";

window.location.replace(`./#${route}`);
