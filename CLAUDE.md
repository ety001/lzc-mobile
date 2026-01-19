# 调试方法

## 检查下面域名是否可以 ping 通

```
ecat.heiyu.space
```

如果不通，直接结束，并报告错误

## 检查命令是否可用

```
lzc-cli docker ps
```

## 编译的 docker 镜像命名

```
dev.ecat.heiyu.space/ety001/lzc-mobile:latest
```

编译命令可以是

```
docker build --push -t dev.ecat.heiyu.space/ety001/lzc-mobile:latest -f docker/Dockerfile .
```

> 编译时，需要随机一个 tag 来替代 latest
> 同时需要把这个 tag 更新到 ~/workspace/lzc-appdb/lzc-mobile/lzc-manifest.yml 文件中的 `services->lzcmobile->image`

## 远程部署命令

```
cd /home/ety001/workspace/lzc-appdb/lzc-mobile && lzc-cli project build && lzc-cli app install
```

执行后，需要等待服务安装和启动，可以通过下面的命令查看服务状态：

```
lzc-cli docker ps
```

> 注意: 远端的服务名搜索时使用的关键词是 `lzcmobile`

服务的 URL 是：

```
https://lzcmobile.ecat.heiyu.space/
```

## 远程服务器登录

```
ssh root@ecat.heiyu.space
```

远程服务器，只能用来查看docker情况，不能做其他操作。

## 服务器 docker 命令

查看 docker 的命令是 `lzc-docker` 而不是 `docker`。

`lzc-docker` 除了可以在服务器运行，在本地运行，一样可以获取到服务器上正在运行的容器信息。

## debug

如何调试过程你发现了问题，然后可以通过先在服务器上进行修改，重启 asterisk 来验证。
通过后，可以将修改应用到本地再编译 docker 镜像再部署测试。

# 版本控制

不要自己提交 commit, 提交 commit 需要经过我的确认.