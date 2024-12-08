import fs from "node:fs/promises";
import path from "node:path";
import core from "@actions/core";
import github from "@actions/github";
import type {ReleaseEvent} from "@octokit/webhooks-types/schema.d.ts";

// Functions
function error(message: string): never {
    core.setFailed(message);
    process.exit(1);
}

// Action inputs
const GH_INPUTS: Record<string, string> = JSON.parse(process.env.GH_INPUTS!);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;

const inputs = {
    releaseId: GH_INPUTS["release-id"]!,
    files: GH_INPUTS["files"]!,
};

// Get release id
let releaseId: number;
if (inputs.releaseId !== "") releaseId = Number(inputs.releaseId);
else {
    if (github.context.eventName !== "release")
        error("Release ID was not specified and cannot be inferred as this is not a release event.");
    const event = github.context.payload as ReleaseEvent;
    releaseId = event.release.id;
}

// Read the files
core.info("Reading files...");
const files = await Promise.all(inputs.files.split("\n").map(async f => {
    const hasMimeType = f.lastIndexOf("&") !== -1;
    const filePath = (hasMimeType ? f.substring(0, f.lastIndexOf("&")) : f).trim();
    const mimeType = (hasMimeType ? f.substring(f.lastIndexOf("&") + 1) : "application/octet-stream").trim().toLowerCase();
    const data = await fs.readFile(filePath);
    core.info(`Read file ${filePath} (type ${mimeType}, size ${data.length} bytes)`);
    return new File([data], path.basename(filePath), {type: mimeType});
}));

// Upload the files
const octokit = github.getOctokit(GITHUB_TOKEN);
core.info("Getting release...");
const release = await octokit.rest.repos.getRelease({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    release_id: releaseId,
});
core.info("Uploading files...");
const responses = await Promise.all(
    files.map(file => {
        core.info(`Uploading ${file.name}...`);
        return fetch(release.data.upload_url.replace("{?name,label}", "?name=" + encodeURIComponent(file.name)), {
            method: "POST",
            headers: {
                "Authorization": "token " + GITHUB_TOKEN,
            },
            body: file
        }).then(res => ({res, file}))
    })
);
core.info("Done uploading files.");
const failedUploads = responses.filter(r => !r.res.ok);
if (failedUploads.length > 0) {
    core.error(`Failed to upload ${failedUploads} file${failedUploads.length === 1 ? "" : "s"}:`);
    for (const failed of failedUploads) {
        const body = await failed.res.text();
        let parsed: string;
        try {
            parsed = JSON.stringify(JSON.parse(body), null, 2);
        }
        catch {
            parsed = body;
        }

        core.error(`${failed.file.name}: ${failed.res.status} (${failed.res.statusText})\n${parsed}`);
    }
    error("Some files failed to upload.");
}
core.info("\x1b[32m✔\x1b[0m All files uploaded successfully.");
process.exit(0);
