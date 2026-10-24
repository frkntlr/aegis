# Aegis Agent Isolated Sandbox Runtime
# Hardened container for running autonomous coding agents safely
FROM node:24-alpine

# Install git, git-lfs, bash, ca-certificates for worktree workflows
RUN apk add --no-cache git git-lfs bash ca-certificates

# Security: Create non-privileged agent user
RUN addgroup -S aegis && adduser -S aegis-agent -G aegis -h /home/aegis-agent

# Set up directories and permissions before dropping root privileges
WORKDIR /workspace
RUN mkdir -p /workspace /app /home/aegis-agent && \
    chown -R aegis-agent:aegis /workspace /app /home/aegis-agent

# Copy compiled Aegis CLI standalone bundle
COPY packages/cli/dist/bin/aegis.js /usr/local/bin/aegis
RUN chmod +x /usr/local/bin/aegis

# Switch to non-root user
USER aegis-agent

# Set environment
ENV NODE_ENV=production
ENV AEGIS_SANDBOX=true

# Launch autonomous agent task loop by default
CMD ["node", "/usr/local/bin/aegis", "auto"]
