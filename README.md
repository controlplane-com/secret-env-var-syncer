# secret-env-var-syncer

Containerized TypeScript cron-style job that syncs Control Plane dictionary secret keys into GVC or workload environment variables and then exits.

## Scripts

- `npm run dev`: run the job directly with TypeScript
- `npm run build`: compile to `dist/`
- `npm run start`: run the compiled job
- `npm run lint`: run ESLint
- `npm run test`: run Vitest
- `npm run coverage`: generate a coverage report
- `npm run check`: lint, test, and build

## Environment

- When this runs as a Control Plane workload, the `CPLN_*` environment variables are available inside the running container. See the **Notes** section below for more details.
- `CPLN_ENDPOINT`: optional Control Plane API base URL, defaults to `https://api.cpln.io`
- `CPLN_TOKEN`: bearer token for the Control Plane API
- `CPLN_ORG`: Control Plane organization name
- `API_TIMEOUT_MS`: optional HTTP timeout in milliseconds, defaults to `10000`

## Config

Create `config.yaml` in the project root:

```yaml
entries:
  - target:
      type: gvc
      name: example-gvc
    secret: shared-secret
```

For a workload target, include the parent GVC and the specific container name:

```yaml
entries:
  - target:
      type: workload
      name: api
      gvc: example-gvc
      container: app
    secret: shared-secret
  - target:
      type: gvc
      name: shared-services
    secret: another-secret
```

Behavior:

- Secret keys are read from the CPLN `/-reveal` endpoint.
- The secret must be a dictionary secret.
- Each entry syncs one secret into one target.
- Each dictionary key becomes an env var name.
- The synced env var value is `cpln://secret/SECRET_NAME.KEY_NAME`.
- GVC sync writes to `spec.env`.
- Workload sync writes only to the named container's `env` list.
- The job skips `PUT` requests when the target already matches the desired env vars.

## Container

Build:

```bash
docker build -t secret-env-var-syncer .
```

Run:

```bash
docker run --rm \
  -e CPLN_ORG=example-org \
  -e CPLN_TOKEN=replace-me \
  -v "$(pwd)/config.yaml:/app/config.yaml:ro" \
  secret-env-var-syncer
```

## CPLN Deployment Example

The repository includes [cpln.yaml.example](/Users/eric/cpln-scratch-pad/secret-env-var-syncer/cpln.yaml.example), which contains an example GVC, cron workload, and identity for running this syncer on Control Plane.

In that example, the workload mounts `config.yaml` from an opaque secret as a volume. This is a good pattern for running the syncer in Control Plane: store the sync configuration in an opaque secret, mount it into the container at `/app/config.yaml`, and let the workload read it at runtime.

The example workload has `suspend: true`, so it will not run on its cron schedule until you change it. In that state, it must be executed manually. If you want the cron workload to run automatically, change `suspend` to `false`.

You should also adjust the cron schedule in the example manifest to match your desired sync frequency.

Before applying the example manifest, point the mounted config secret at your own sync configuration.

## Notes

When this project runs as a CPLN workload, the `CPLN_TOKEN` environment variable is already available to the container and is tied to the selected identity. You do not need to create or inject a separate service account token.

The identity used by the workload must have policies created and bound to it for every resource the syncer needs to access. In practice, that means:

- `reveal` permission on the opaque secret that contains the mounted `config.yaml`
- `reveal` permission on each dictionary secret that will be read
- edit permission on each target GVC that will be modified
- edit permission on each target workload that will be modified

Those policies should target the required secrets, GVCs, and workloads, and the policy bindings should be made to the identity used by this workload.
