# Aegis Agent Isolated Sandbox Runtime
# Hardened container for running autonomous coding agents safely
FROM node:24-alpine

# Security: Create non-privileged agent user
RUN addgroup -S aegis && adduser -S aegis-agent -G aegis

# Install git, git-lfs for worktree workflows
RUN apk add --no-cache git git-lfs bash ca-certificates

WORKDIR /workspace

# Switch to non-root user
USER aegis-agent

# Set environment
ENV NODE_ENV=production
ENV AEGIS_SANDBOX=true

CMD ["node", "--version"]
