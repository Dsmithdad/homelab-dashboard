"""
System monitoring endpoints
"""
import psutil
from fastapi import APIRouter

router = APIRouter()

@router.get("/cpu")
async def get_cpu_info():
    return {
        "percent": psutil.cpu_percent(interval=1),
        "count": psutil.cpu_count(),
        "count_logical": psutil.cpu_count(logical=True),
        "stats": psutil.cpu_stats()._asdict(),
        "freq": psutil.cpu_freq()._asdict() if psutil.cpu_freq() else None
    }

@router.get("/memory")
async def get_memory_info():
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return {
        "virtual": {
            "total": mem.total,
            "available": mem.available,
            "percent": mem.percent,
            "used": mem.used,
            "free": mem.free
        },
        "swap": {
            "total": swap.total,
            "used": swap.used,
            "free": swap.free,
            "percent": swap.percent
        }
    }

@router.get("/disk")
async def get_disk_info():
    disk_partitions = psutil.disk_partitions()
    disk_usage = []

    for partition in disk_partitions:
        try:
            partition_usage = psutil.disk_usage(partition.mountpoint)
            disk_usage.append({
                "device": partition.device,
                "mountpoint": partition.mountpoint,
                "fstype": partition.fstype,
                "opts": partition.opts,
                "total": partition_usage.total,
                "used": partition_usage.used,
                "free": partition_usage.free,
                "percent": (partition_usage.used / partition_usage.total) * 100
            })
        except PermissionError:
            # Some partitions may not be accessible
            continue

    # Also get disk I/O counters
    disk_io = psutil.disk_io_counters()

    return {
        "partitions": disk_usage,
        "io_counters": disk_io._asdict() if disk_io else None
    }

@router.get("/network")
async def get_network_info():
    net_io = psutil.net_io_counters()
    net_if_addrs = psutil.net_if_addrs()
    net_if_stats = psutil.net_if_stats()

    interfaces = {}
    for interface_name, addresses in net_if_addrs.items():
        if interface_name in net_if_stats:
            stats = net_if_stats[interface_name]
            interfaces[interface_name] = {
                "addresses": [addr._asdict() for addr in addresses],
                "stats": {
                    "isup": stats.isup,
                    "duplex": stats.duplex,
                    "speed": stats.speed,
                    "mtu": stats.mtu
                }
            }

    return {
        "interfaces": interfaces,
        "io_counters": net_io._asdict() if net_io else None
    }

def _snapshot_processes():
    """One row per readable process. cpu_percent measures since the previous call (psutil keeps the Process objects),
    so it is a real average over the polling gap. Command lines are left out on purpose: they often hold passwords/tokens."""
    rows = []
    for p in psutil.process_iter():
        try:
            with p.oneshot():
                mem = p.memory_info().rss
                rows.append({
                    "pid": p.pid,
                    "name": p.name(),
                    "user": p.username(),
                    "cpu": p.cpu_percent(None),  # % of ONE core, like top (can pass 100 for multi-threaded programs)
                    "mem_bytes": mem,
                    "threads": p.num_threads(),
                    "status": p.status(),
                })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    return rows


_snapshot_processes()  # warm-up so the first real request already has a CPU baseline


@router.get("/processes")
def get_processes(limit: int = 15):
    """Top processes by CPU and by memory, plus simple totals. Sync def: runs in FastAPI's thread pool."""
    limit = max(1, min(limit, 50))
    rows = _snapshot_processes()
    by_status = {}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
    total_mem = psutil.virtual_memory().total
    for r in rows:
        r["mem_percent"] = round(r["mem_bytes"] / total_mem * 100, 2)
    return {
        "total": len(rows),
        "by_status": by_status,
        "cores": psutil.cpu_count() or 1,
        "by_cpu": sorted(rows, key=lambda r: r["cpu"], reverse=True)[:limit],
        "by_memory": sorted(rows, key=lambda r: r["mem_bytes"], reverse=True)[:limit],
    }


@router.get("/boot-time")
async def get_boot_time():
    return {
        "boot_time": psutil.boot_time()
    }