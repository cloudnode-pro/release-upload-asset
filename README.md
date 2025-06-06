# Release: Upload Asset

Upload files to a GitHub release.

## Example Usage

```yaml
# …
jobs:
  publish:
    # …
    permissions:
      contents: write
    # …
    steps:
      # …
      - name: Upload to release
        uses: cloudnode-pro/release-upload-asset@v1
        with:
          # See the ‘Inputs’ section below for details.
          gh-token: ${{ github.token }}
          release-id: 123456 # Optional for `release` events.
          files: |
            path/to/file.txt; type=text/plain; name=File1.txt
            path/to/foo/bar.baz; if=${{ github.event_name == 'release' }}
```

## Inputs

### `gh-token`

The GitHub token to use for authentication.

If you are uploading to a release in the same repository, you can use `${{github.token}}`, which is a secret
generated by the workflow. Otherwise, you need to manually create a token, save it as a repository secret, and pass it
using `${{secrets.NAME_OF_SECRET}}`.

### `release-id`

The ID of the release to which to upload files.

This is optional for `release` events, in which case the ID can be inferred (if left unset) from the release that
triggered the workflow.

### `files`

Paths to the files to upload. Separated by newline.

After the file path, you can add parameters separated by semicolons.

The recognised parameters are:

<dl>
    <dt><code>type</code></dt>
    <dd>The MIME type of the file. Defaults to <code>application/octet-stream</code>.
    <dt><code>name</code></dt>
    <dd>The name of the file. Defaults to the basename of the file path.</dd>
    <dt><code>if</code></dt>
    <dd>Whether to actually upload this file. You can use this in combination with
        <a href="https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/evaluate-expressions-in-workflows-and-actions">GitHub expressions</a>.
        The allowed values are <code>true</code> and <code>false</code>. Defaults to <code>true</code>.
</dd>
</dl>

Examples:

```yaml
files: |-
  /path/to/file1.txt
  /path/to/file2.txt; type=text/plain; name=Named File.txt
  /path/to/file3.txt; if=${{ 'foo' == 'bar' }}
```

### Permissions

Uploading release assets requires the `contents: write`.

See: [Controlling permissions for GITHUB_TOKEN](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/controlling-permissions-for-github_token)

Example:

```yaml
permissions:
  contents: write
```
