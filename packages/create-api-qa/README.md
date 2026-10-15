# create-api-qa

Creates a project from a release of the API QA agentic framework: contract-driven test design,
Playwright and TypeScript execution, test-management and tracker adapters, and the agentic process
that connects them.

```sh
npm create api-qa my-api-tests
```

Needs Node 22 or later and git; Docker runs the example APIs.

## What it does

The package carries one framework release, the one its version names. In the new directory it:

1. unpacks that release;
2. starts the project's own backlog with `REPO-01`, naming the release and its commit, and keeps
   only the header of the changelog;
3. names the package after the directory (or `--name`), at version `0.0.0`, in `package.json` and
   `package-lock.json`;
4. makes the first commit on `main`, when git has a `user.email`;
5. runs `npm ci`.

It refuses a directory that exists and is not empty.

```text
npm create api-qa <directory> [-- --name <package-name>] [--skip-git] [--skip-install]
```

## Then

`npm run gates` passes before you change anything. Create the GitHub repository from the new
clone, set it up as the framework's guide `docs/guides/adopt-the-template.md` describes (step 2),
and add your first API as a service pack with `npm run scaffold:service`
(`docs/guides/add-a-service-pack.md`).

## License

Apache-2.0. The framework's `LICENSE` and `NOTICE` travel with the package and with every project
it creates.
