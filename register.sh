#!/system/bin/sh

if [ -t 1 ] || [ -t 2 ]; then
    C_RESET="$(printf '\033[0m')"
    C_BOLD="$(printf '\033[1m')"
    C_DIM="$(printf '\033[2m')"
    C_RED="$(printf '\033[31m')"
    C_GREEN="$(printf '\033[32m')"
    C_YELLOW="$(printf '\033[33m')"
    C_BLUE="$(printf '\033[34m')"
    C_CYAN="$(printf '\033[36m')"
else
    C_RESET=""
    C_BOLD=""
    C_DIM=""
    C_RED=""
    C_GREEN=""
    C_YELLOW=""
    C_BLUE=""
    C_CYAN=""
fi

print_line() {
    printf '%b\n' "${C_DIM}----------------------------------------${C_RESET}"
}

print_header() {
    print_line
    printf '%b\n' "${C_BOLD}${C_CYAN}AaTempSpoof 设备 ID 获取${C_RESET}"
    printf '%b\n' "${C_DIM}脚本只读取并显示当前设备主板 ID，不会打开捐赠链接${C_RESET}"
    print_line
}

print_step() {
    printf '\n%b %s\n' "${C_BLUE}${C_BOLD}[$1]${C_RESET}" "$2"
}

print_ok() {
    printf '%b %s\n' "${C_GREEN}成功:${C_RESET}" "$*"
}

print_warn() {
    printf '%b %s\n' "${C_YELLOW}提示:${C_RESET}" "$*"
}

print_err() {
    printf '%b %s\n' "${C_RED}错误:${C_RESET}" "$*" >&2
}

print_id_card() {
    id="$1"
    printf '%b\n' "${C_DIM}主板ID${C_RESET}"
    printf '%b%s%b\n' "${C_BOLD}${C_GREEN}" "$id" "${C_RESET}"
}

first_value() {
    value="$1"
    if [ -n "$value" ] && [ "$value" != "unknown" ] && [ "$value" != "UNKNOWN" ]; then
        printf '%s' "$value"
        return 0
    fi
    return 1
}

file_value() {
    file="$1"
    if [ -r "$file" ]; then
        value="$(cat "$file" 2>/dev/null | tr -d '\000\r\n ')"
        first_value "$value" && return 0
    fi
    return 1
}

prop_value() {
    key="$1"
    value="$(getprop "$key" 2>/dev/null | tr -d '\r\n ')"
    first_value "$value" && return 0
    return 1
}

su_value() {
    cmd="$1"
    if command -v su >/dev/null 2>&1; then
        value="$(su -c "$cmd" 2>/dev/null | tr -d '\000\r\n ')"
        first_value "$value" && return 0
    fi
    return 1
}

get_board_id() {
    file_value /sys/devices/soc0/serial_number && return 0
    file_value /sys/devices/system/soc/soc0/serial_number && return 0
    su_value 'cat /sys/devices/soc0/serial_number 2>/dev/null' && return 0
    su_value 'cat /sys/devices/system/soc/soc0/serial_number 2>/dev/null' && return 0
    su_value 'getprop ro.boot.serialno 2>/dev/null' && return 0
    su_value 'getprop ro.serialno 2>/dev/null' && return 0
    prop_value ro.boot.serialno && return 0
    prop_value ro.serialno && return 0
    prop_value ro.vendor.oplus.radio.serialno && return 0
    prop_value vendor.oplus.caihong.serialno && return 0
    return 1
}

print_header

print_step "1/1" "识别当前主板"
ID="$(get_board_id)"
if [ -z "$ID" ]; then
    print_err "获取主板ID失败"
    exit 1
fi
print_ok "主板ID识别完成"
print_id_card "$ID"
print_warn "复制上面的主板ID，在一次性注册链接页面填写注册"
