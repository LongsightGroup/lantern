# syntax=docker/dockerfile:1.7

FROM denoland/deno:alpine-2.7.7

USER root
WORKDIR /app

COPY --chown=deno:deno deno.json deno.lock main.ts ./
COPY --chown=deno:deno src ./src
COPY --chown=deno:deno sdk ./sdk

USER deno

RUN deno cache --lock=deno.lock --frozen main.ts

COPY --chown=deno:deno examples ./examples
RUN mkdir -p /app/var/packages

EXPOSE 8417

CMD [
  "deno",
  "run",
  "--cached-only",
  "--no-prompt",
  "--allow-read=examples,var",
  "--allow-write=var",
  "--allow-env=PORT,DATABASE_URL,LTI_TOOL_PRIVATE_JWK,APP_ORIGIN,APP_RUNTIME_ORIGIN,LANTERN_OPERATOR_NAME,USER,LOGNAME",
  "--allow-net",
  "main.ts"
]
