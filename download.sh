#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# E-Broker Dataset Downloader
#
# Downloads:
#   1. TRCProject / E-waste Detection Model v5
#   2. diggi / PC_Parts v4
#   3. khobaer9999 / recyclable electronic waste
#   4. ElectroCom61
#
# Everything goes into:
#   ./dataset/
# ============================================================

ROOT="$(pwd)"
DATASET_DIR="$ROOT/dataset"

# ------------------------------------------------------------
# Pretty output
# ------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ------------------------------------------------------------
# Error handler
# ------------------------------------------------------------

trap 'error "Script failed at line $LINENO. Command: $BASH_COMMAND"' ERR

# ------------------------------------------------------------
# Create dataset directory
# ------------------------------------------------------------

mkdir -p "$DATASET_DIR"

info "Dataset directory:"
echo "  $DATASET_DIR"
echo

# ------------------------------------------------------------
# Check required commands
# ------------------------------------------------------------

for cmd in python3 git; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        error "'$cmd' is not installed."
        exit 1
    fi
done

# ------------------------------------------------------------
# Check / install Roboflow Python package
# ------------------------------------------------------------

if ! python3 -c "import roboflow" >/dev/null 2>&1; then
    info "Roboflow Python SDK not found."
    info "Installing it..."

    python3 -m pip install roboflow

    if ! python3 -c "import roboflow" >/dev/null 2>&1; then
        error "Could not install/import the Roboflow Python SDK."
        exit 1
    fi

    success "Roboflow SDK installed."
else
    success "Roboflow SDK already installed."
fi

# ------------------------------------------------------------
# Get Roboflow API key
# ------------------------------------------------------------

if [[ -z "${ROBOFLOW_API_KEY:-}" ]]; then
    echo
    echo "============================================================"
    echo " Roboflow API Key Required"
    echo "============================================================"
    echo
    echo "Get your API key from your Roboflow account."
    echo
    read -rsp "Enter ROBOFLOW_API_KEY: " ROBOFLOW_API_KEY
    echo
fi

if [[ -z "$ROBOFLOW_API_KEY" ]]; then
    error "ROBOFLOW_API_KEY is empty."
    exit 1
fi

export ROBOFLOW_API_KEY

# ------------------------------------------------------------
# Download Roboflow dataset helper
# ------------------------------------------------------------

download_roboflow() {
    local name="$1"
    local workspace="$2"
    local project="$3"
    local version="$4"
    local output="$5"

    echo
    echo "============================================================"
    echo " $name"
    echo "============================================================"
    echo

    mkdir -p "$output"

    # Check whether the dataset already appears downloaded.
    if [[ -f "$output/data.yaml" ]]; then
        success "$name already exists. Skipping."
        return 0
    fi

    info "Workspace : $workspace"
    info "Project   : $project"
    info "Version   : $version"
    info "Format    : YOLO (Roboflow yolov8 slug)"
    info "Output    : $output"
    echo

    python3 - "$workspace" "$project" "$version" "$output" <<'PY'
import os
import sys
import traceback

from roboflow import Roboflow

workspace = sys.argv[1]
project_name = sys.argv[2]
version_number = int(sys.argv[3])
output_dir = os.path.abspath(sys.argv[4])

api_key = os.environ.get("ROBOFLOW_API_KEY")

if not api_key:
    print("ERROR: ROBOFLOW_API_KEY is not set.")
    sys.exit(10)

try:
    print("[PYTHON] Connecting to Roboflow...")

    rf = Roboflow(api_key=api_key)

    print(f"[PYTHON] Accessing workspace: {workspace}")
    workspace_obj = rf.workspace(workspace)

    print(f"[PYTHON] Accessing project: {project_name}")
    project = workspace_obj.project(project_name)

    print(f"[PYTHON] Accessing version: {version_number}")
    version = project.version(version_number)

    print("[PYTHON] Downloading YOLO dataset...")

    dataset = version.download(
        "yolov8",
        location=output_dir,
        overwrite=False
    )

    print(f"[PYTHON] Download completed.")
    print(f"[PYTHON] Dataset location: {dataset.location}")

except Exception as e:
    print()
    print("============================================================")
    print("ROBOfLOW DOWNLOAD FAILED")
    print("============================================================")
    print()
    print(f"Error: {e}")
    print()
    traceback.print_exc()
    sys.exit(20)
PY

    # --------------------------------------------------------
    # Verify actual files exist
    # --------------------------------------------------------

    if [[ ! -f "$output/data.yaml" ]]; then
        error "$name did NOT download correctly."
        error "Expected: $output/data.yaml"
        exit 1
    fi

    if [[ ! -d "$output/train/images" ]]; then
        error "$name is missing train/images."
        exit 1
    fi

    image_count=$(find "$output" \
        -type f \
        \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) \
        | wc -l)

    if [[ "$image_count" -eq 0 ]]; then
        error "$name contains zero images."
        exit 1
    fi

    success "$name downloaded successfully."
    success "Images found: $image_count"
}

# ============================================================
# 1. TRCProject E-Waste Detection Model
# ============================================================

download_roboflow \
    "TRCProject E-Waste Detection Model" \
    "trcproject" \
    "e-waste-detection-model" \
    "5" \
    "$DATASET_DIR/trcproject"

# ============================================================
# 2. PC_Parts
# ============================================================

download_roboflow \
    "PC_Parts" \
    "diggi" \
    "pc_parts" \
    "4" \
    "$DATASET_DIR/pc_parts"

# ============================================================
# 3. Recyclable Electronic Waste
# ============================================================

echo
echo "============================================================"
echo " Recyclable Electronic Waste"
echo "============================================================"
echo

warn "This dataset currently does not expose a normal dataset-version"
warn "download in the same way as the two datasets above."

echo
echo "Roboflow page:"
echo "https://universe.roboflow.com/khobaer9999/recyclable-electronic-waste"
echo

warn "Skipping automatic download rather than silently creating an empty folder."

# ============================================================
# 4. ElectroCom61
# ============================================================

echo
echo "============================================================"
echo " ElectroCom61"
echo "============================================================"
echo

ELECTRO_DIR="$DATASET_DIR/electrocom61"

if [[ -d "$ELECTRO_DIR/.git" ]]; then
    success "ElectroCom61 already exists. Skipping."
else
    TMP_DIR="$(mktemp -d)"

    info "Cloning ElectroCom61..."

    git clone \
        --depth 1 \
        https://github.com/faiyazabdullah/ElectroCom61.git \
        "$TMP_DIR/ElectroCom61"

    mkdir -p "$ELECTRO_DIR"

    cp -a "$TMP_DIR/ElectroCom61/." "$ELECTRO_DIR/"

    rm -rf "$TMP_DIR"

    success "ElectroCom61 downloaded."
fi

# ============================================================
# Final verification
# ============================================================

echo
echo "============================================================"
echo " FINAL DATASET CHECK"
echo "============================================================"
echo

FAILED=0

check_dataset() {
    local name="$1"
    local path="$2"

    if [[ ! -d "$path" ]]; then
        error "$name: directory missing"
        FAILED=1
        return
    fi

    local files
    files=$(find "$path" -type f | wc -l)

    if [[ "$files" -eq 0 ]]; then
        error "$name: EMPTY"
        FAILED=1
    else
        success "$name: $files files"
    fi
}

check_dataset \
    "TRCProject" \
    "$DATASET_DIR/trcproject"

check_dataset \
    "PC_Parts" \
    "$DATASET_DIR/pc_parts"

check_dataset \
    "Recyclable Electronic Waste" \
    "$DATASET_DIR/recyclable_electronic_waste"

check_dataset \
    "ElectroCom61" \
    "$DATASET_DIR/electrocom61"

echo

if [[ "$FAILED" -ne 0 ]]; then
    error "One or more datasets are missing/empty."
    exit 1
fi

success "All datasets contain files."

echo
echo "Dataset directory:"
echo
echo "$DATASET_DIR"
echo

find "$DATASET_DIR" -maxdepth 2 -type f | head -50

echo
success "DONE"
