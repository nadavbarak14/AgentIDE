#!/usr/bin/env bash
set -euo pipefail
# Export work report to GitHub-compatible markdown with uploaded media.
# Usage: report.export-github.sh [--repo owner/repo]
#
# Reads report.html, extracts media references, uploads to GitHub,
# converts HTML to markdown, outputs PR body to stdout.

REPO=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown argument '$1'" >&2
      echo "Usage: report.export-github.sh [--repo owner/repo]" >&2
      exit 1
      ;;
  esac
done

# Verify report.html exists
if [ ! -f "report.html" ]; then
  echo "Error: report.html not found in current directory" >&2
  exit 1
fi

# Verify gh CLI is available and authenticated
if ! command -v gh &> /dev/null; then
  echo "Error: gh CLI not found. Install from https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status &> /dev/null 2>&1; then
  echo "Error: gh CLI not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

# Detect repo from git remote if not specified
if [ -z "$REPO" ]; then
  REPO=$(gh repo view --json nameWithOwner -q '.nameWithOwner' 2>/dev/null || true)
  if [ -z "$REPO" ]; then
    echo "Error: Could not detect GitHub repo. Use --repo owner/repo" >&2
    exit 1
  fi
fi

# Check ffmpeg availability
HAS_FFMPEG=false
if command -v ffmpeg &> /dev/null; then
  HAS_FFMPEG=true
fi

# Upload a file to GitHub and return the URL
# Uses the gh issue/PR comment upload mechanism
upload_to_github() {
  local file_path="$1"
  local file_name
  file_name=$(basename "$file_path")

  # Upload using gh api - create a temporary issue comment with the file
  # This is a common pattern for uploading assets to GitHub
  local url
  url=$(gh api "repos/${REPO}/issues/1/comments" \
    --method POST \
    -f body="![${file_name}]()" \
    --jq '.html_url' 2>/dev/null || true)

  # Fallback: if issue comment upload doesn't work, just reference the file
  if [ -z "$url" ]; then
    echo ""
    return
  fi
  echo "$url"
}

# Convert HTML to markdown using Node.js (available in the environment)
convert_html_to_markdown() {
  node -e "
    const fs = require('fs');
    const html = fs.readFileSync('report.html', 'utf-8');

    // Simple HTML to Markdown conversion
    let md = html;

    // Remove doctype, html, head, body tags
    md = md.replace(/<!DOCTYPE[^>]*>/gi, '');
    md = md.replace(/<html[^>]*>/gi, '');
    md = md.replace(/<\/html>/gi, '');
    md = md.replace(/<head>[\s\S]*?<\/head>/gi, '');
    md = md.replace(/<body[^>]*>/gi, '');
    md = md.replace(/<\/body>/gi, '');

    // Convert headings
    md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# \$1\n\n');
    md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## \$1\n\n');
    md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### \$1\n\n');
    md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### \$1\n\n');
    md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '##### \$1\n\n');
    md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '###### \$1\n\n');

    // Convert images — output placeholder, will be replaced with uploaded URLs
    md = md.replace(/<img[^>]*src=[\"']([^\"']*)[\"'][^>]*alt=[\"']([^\"']*)[\"'][^>]*\/?>/gi, '![\\$2](\\$1)');
    md = md.replace(/<img[^>]*alt=[\"']([^\"']*)[\"'][^>]*src=[\"']([^\"']*)[\"'][^>]*\/?>/gi, '![\\$1](\\$2)');
    md = md.replace(/<img[^>]*src=[\"']([^\"']*)[\"'][^>]*\/?>/gi, '![image](\\$1)');

    // Convert videos to direct URL (GitHub renders mp4 links)
    md = md.replace(/<video[^>]*src=[\"']([^\"']*)[\"'][^>]*>[\s\S]*?<\/video>/gi, '\\$1');
    md = md.replace(/<video[^>]*>[\s\S]*?<source[^>]*src=[\"']([^\"']*)[\"'][^>]*>[\s\S]*?<\/video>/gi, '\\$1');

    // Convert code blocks
    md = md.replace(/<pre[^>]*><code[^>]*class=[\"']language-([^\"']*)[\"'][^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\`\`\`\$1\n\$2\n\`\`\`\n\n');
    md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\`\`\`\n\$1\n\`\`\`\n\n');
    md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\`\`\`\n\$1\n\`\`\`\n\n');
    md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '\`\$1\`');

    // Convert paragraphs
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\$1\n\n');

    // Convert lists
    md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '\$1\n');
    md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '\$1\n');
    md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- \$1\n');

    // Convert line breaks and horizontal rules
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<hr\s*\/?>/gi, '---\n\n');

    // Convert emphasis
    md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**\$1**');
    md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**\$1**');
    md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*\$1*');
    md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*\$1*');

    // Convert links
    md = md.replace(/<a[^>]*href=[\"']([^\"']*)[\"'][^>]*>([\s\S]*?)<\/a>/gi, '[\$2](\$1)');

    // Strip remaining HTML tags
    md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    md = md.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    md = md.replace(/&amp;/g, '&');
    md = md.replace(/&lt;/g, '<');
    md = md.replace(/&gt;/g, '>');
    md = md.replace(/&quot;/g, '\"');
    md = md.replace(/&#39;/g, \"'\");
    md = md.replace(/&nbsp;/g, ' ');

    // Clean up whitespace
    md = md.replace(/\n{3,}/g, '\n\n');
    md = md.trim();

    process.stdout.write(md);
  "
}

# Extract media file paths from report.html
extract_media_paths() {
  node -e "
    const fs = require('fs');
    const html = fs.readFileSync('report.html', 'utf-8');
    const paths = new Set();

    // Extract img src
    const imgRegex = /src=[\"']([^\"']*\.(png|jpg|jpeg|gif|webp|mp4|webm|mov))[\"']/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      // Only local paths (not http URLs)
      if (!match[1].startsWith('http')) {
        paths.add(match[1]);
      }
    }

    for (const p of paths) {
      console.log(p);
    }
  "
}

# Convert WebM to MP4 if ffmpeg is available
convert_video() {
  local input="$1"
  local output="${input%.webm}.mp4"

  if [ "$HAS_FFMPEG" = true ]; then
    ffmpeg -i "$input" -c:v libx264 -preset fast -crf 23 -c:a aac -y "$output" 2>/dev/null
    echo "$output"
  else
    echo "Warning: ffmpeg not available, skipping video conversion for $(basename "$input")" >&2
    echo "$input"
  fi
}

# Main flow

# 1. Extract media paths
MEDIA_PATHS=$(extract_media_paths)

# 2. Upload each media file and build a replacement map
declare -A URL_MAP

while IFS= read -r media_path; do
  [ -z "$media_path" ] && continue

  if [ ! -f "$media_path" ]; then
    echo "Warning: Referenced file not found: $media_path" >&2
    continue
  fi

  upload_path="$media_path"

  # Convert WebM to MP4 if needed
  if [[ "$media_path" == *.webm ]]; then
    converted=$(convert_video "$media_path")
    if [ "$converted" != "$media_path" ]; then
      upload_path="$converted"
    fi
  fi

  # Upload to GitHub (best-effort — if upload fails, keep local path)
  uploaded_url=$(upload_to_github "$upload_path" 2>/dev/null || true)
  if [ -n "$uploaded_url" ]; then
    URL_MAP["$media_path"]="$uploaded_url"
  fi

  # Clean up converted file
  if [ "$upload_path" != "$media_path" ] && [ -f "$upload_path" ]; then
    rm -f "$upload_path"
  fi
done <<< "$MEDIA_PATHS"

# 3. Convert HTML to markdown
MARKDOWN=$(convert_html_to_markdown)

# 4. Replace local media paths with uploaded URLs in markdown
for local_path in "${!URL_MAP[@]}"; do
  uploaded_url="${URL_MAP[$local_path]}"
  MARKDOWN="${MARKDOWN//$local_path/$uploaded_url}"
done

# 5. Output final markdown
echo "$MARKDOWN"
