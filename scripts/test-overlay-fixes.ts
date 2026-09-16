// Sanity test for OVERLAY-1/2 — run: bun scripts/test-overlay-fixes.ts
import {
  buildDeploymentConfig,
  resolvePodImage,
} from "../src/lib/infranex/deployment/config";
import type { Subnet, GPUOffer } from "../src/lib/infranex/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`${cond ? "PASS" : "FAIL"} — ${name}${cond ? "" : `: ${detail}`}`);
  if (!cond) failures++;
}

// --- resolvePodImage ladder ---
check("CUDA 11.x → cuda11.8 image", resolvePodImage("11.8").includes("cuda11.8.0"));
check("CUDA 12.1 → cuda12.1 image", resolvePodImage("12.1").includes("cuda12.1.0"));
check("CUDA 12.4 → cuda12.1 image", resolvePodImage("12.4").includes("cuda12.1.0"));
check("null CUDA → default 12.1 image", resolvePodImage(null).includes("cuda12.1.0"));
check("image is runpod/pytorch family", resolvePodImage("12.1").startsWith("runpod/pytorch:"));

// --- buildDeploymentConfig without hint (fallback) ---
const subnet: Subnet = {
  netuid: 8, name: "Tau", symbol: "TAN", category: "Inference", minVramGb: 24,
  recommendedGpu: "H100",
} as Subnet;
const offer: GPUOffer = {
  id: "runpod-test-1", model: "H100 80GB", vramGb: 80, provider: "runpod",
  hourlyPrice: 2.0, monthlyPrice: 1460, region: "us",
} as GPUOffer;

const fallback = buildDeploymentConfig(subnet, offer);
check("fallback imageSource = category-fallback", fallback.docker.imageSource === "category-fallback");
check("fallback repoDockerfileBase null", fallback.docker.repoDockerfileBase === null);
check("fallback requirements.cudaVersion = template 12.1", fallback.requirements.cudaVersion === "12.1");
check("fallback command uses neurons/miner.py", fallback.docker.command.includes("neurons/miner.py"));

// --- buildDeploymentConfig with a repo-derived hint ---
const hint = {
  dockerImage: "pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime",
  dockerRequired: true,
  pythonVersion: "3.11",
  cudaMinVersion: "12.1",
  entrypoint: "neurons/miner.py",
};
const withHint = buildDeploymentConfig(subnet, offer, { profileHint: hint });
check("hint imageSource = subnet-requirements", withHint.docker.imageSource === "subnet-requirements");
check("hint pod image CUDA-matched", withHint.docker.imageName.includes("cuda12.1.0"));
check("hint repoDockerfileBase preserved", withHint.docker.repoDockerfileBase === hint.dockerImage);
check("hint pythonVersion from profile", withHint.requirements.pythonVersion === "3.11");
check("hint cudaVersion from profile", withHint.requirements.cudaVersion === "12.1");
check("entrypoint in command", withHint.docker.command.startsWith("python neurons/miner.py "));

// Dockerfile FROM parsing rules (mirror of profiler logic)
function parseFroms(content: string): string | null {
  const froms = [...content.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/gim)]
    .map((m) => m[1])
    .filter((img) => img && !img.includes("${") && img.toLowerCase() !== "scratch");
  return froms.length > 0 ? froms[froms.length - 1] : null;
}
check("single FROM", parseFroms("FROM pytorch/pytorch:2.1.0\nRUN x") === "pytorch/pytorch:2.1.0");
check("multi-stage → last FROM", parseFroms("FROM a AS build\nFROM b\nCMD x") === "b");
check("skips ${VAR}", parseFroms("ARG BASE\nFROM ${BASE}\nRUN x") === null);
check("skips scratch", parseFroms("FROM scratch\nCOPY x /") === null);
check("handles --platform", parseFroms("FROM --platform=linux/amd64 nvidia/cuda:12.4.1-devel-ubuntu22.04") === "nvidia/cuda:12.4.1-devel-ubuntu22.04");

// github URL normalization rules (mirror of profiler logic)
function parseGithubUrl(url: string) {
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const u = new URL(normalized);
    if (!u.hostname.includes("github.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, ""), branch: parts[3] || "main" };
  } catch { return null; }
}
check("bare github.com URL", parseGithubUrl("github.com/org/repo")?.repo === "repo");
check("https URL", parseGithubUrl("https://github.com/org/repo")?.owner === "org");
check(".git suffix stripped", parseGithubUrl("https://github.com/org/repo.git")?.repo === "repo");
check("/tree/branch → branch", parseGithubUrl("https://github.com/org/repo/tree/dev")?.branch === "dev");
check("non-github rejected", parseGithubUrl("https://gitlab.com/org/repo") === null);

process.exit(failures > 0 ? 1 : 0);
