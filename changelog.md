# AaTempSpoof v15.1 正式版更新公告

## 安装与卸载

- 移除刷入模块时的充电状态检测，不再读取 `power_supply` 节点判断是否连接充电器。
- 移除 WebUI 无残留卸载前及卸载脚本内部的充电状态检测，修复未充电时仍被提示拔掉充电线的问题。
- 保留 WebUI 二次确认、一次性卸载授权、系统状态恢复、模块目录清理和卸载完成提示。

## 运行时稳定性

- 修复部分 Qualcomm PMIC GLINK 设备读取 `wireless/online` 时产生 `tr -d '\r\n'` 长时间占用 CPU 的问题。
- 充电状态检测改为 Android shell 内建的 1 秒限时单行读取，不再为 `online`、`type` 和 `status` 节点启动外部过滤进程；节点异常时会快速返回并继续运行。

## StrongBox／TEE 硬件绑定诊断

- StrongBox 不可用时继续自动回退到 TEE，不会把“不支持 StrongBox”误判为整机不支持硬件密钥。
- 将硬件绑定错误拆分为运行环境异常、Android KeyStore／TEE 调用失败、硬件证明生成或校验失败、证明文件保存失败及真实硬件密钥不可用。
- 只有系统明确返回 `hardware_unavailable` 或密钥属于软件 KeyStore 时，才提示本机确实没有可用的 StrongBox／TEE 硬件密钥。
- 安装日志新增安全错误标记，后续可直接根据错误阶段定位 ROM、KeyStore、Provider、系统时间、加密库或缓存写入问题。

## 版本升级

- 主程序、配套应用、WebUI、内核桥接及硬件证明域统一升级至 v15.1。
- 从 v15.0 覆盖升级不需要重新注册设备；刷入时会使用原硬件密钥生成 v15.1 本机证明。
