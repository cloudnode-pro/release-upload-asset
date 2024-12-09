import fs from "node:fs/promises";
import path from "node:path";
import core from "@actions/core";
import github from "@actions/github";
import type {ReleaseEvent} from "@octokit/webhooks-types/schema.d.ts";
import {parse as parseUriTemplate} from "rfc6570-uri-template";

// Functions
function error(message: string): never {
    core.setFailed(message);
    process.exit(1);
}

function parseInputFileParams(input: string): {path: string, params: Record<string, string>} {
    const [filePath, ...rawParams] = input.split(/(?<!\\);\s*/);
    const params: Record<string, string> = {};
    for (const rawParam of rawParams) {
        const equalsIndex = rawParam.indexOf("=");
        if (equalsIndex === -1) params[rawParam.trim()] = "";
        else params[rawParam.substring(0, equalsIndex)] = rawParam.substring(equalsIndex + 1);
    }
    return {path: filePath!, params};
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
const files = (await Promise.all(inputs.files.split("\n").map(async f => {
    const {path: filePath, params} = parseInputFileParams(f);
    if ("if" in params) {
        if (params.if === "false")
            return null;
        else if (params.if !== "false")
            core.warning(`Invalid condition value ‘${params.if}’. Must be ‘true’ or ‘false’.`);
    }
    const mimeType = params["type"] ?? "application/octet-stream";
    const fileName = params["filename"] ?? path.basename(filePath);

    const data = await fs.readFile(filePath);
    core.info(`Read file: ${filePath} (type=${mimeType}; name=${fileName}; size=${data.length})`);
    return new File([data], path.basename(filePath), {type: mimeType});
}))).filter(f => f !== null);

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
    files.map(async file => {
        core.info(`Uploading ${file.name}...`);
        const res = await fetch(parseUriTemplate(release.data.upload_url).expand({name: file.name}), {
            method: "POST",
            headers: {
                "Authorization": "token " + GITHUB_TOKEN,
            },
            body: file
        });
        return ({res, file});
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
