"""
Firewall Dashboard Backend API
FastAPI server for managing the Stateful Firewall with DPI
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
import subprocess
import json
import re
from typing import List, Optional, Dict, Any
from datetime import datetime
import asyncio
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Firewall Dashboard API",
    description="REST API for managing the Stateful Firewall with DPI",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# DATA MODELS
# ============================================================================

class Connection(BaseModel):
    """TCP Connection entry"""
    src_ip: str
    src_port: int
    dst_ip: str
    dst_port: int
    state: str
    packets: int
    bytes: int

class BlacklistEntry(BaseModel):
    """Blacklist entry"""
    ip: str
    port: int = 0
    reason: str = ""

class Statistics(BaseModel):
    """Firewall statistics"""
    total_connections: int
    blocked_ips: int
    active_connections: int
    packets_processed: int
    dpi_alerts: int
    mirror_active: bool
    module_status: str
    uptime_seconds: int

class Alert(BaseModel):
    """Security alert"""
    timestamp: str
    type: str  # "dpi", "blacklist", "connection"
    source: str
    destination: str
    message: str
    severity: str  # "info", "warning", "critical"

class KernelLog(BaseModel):
    """Kernel log message"""
    timestamp: str
    level: str  # "INFO", "WARNING", "ERROR"
    message: str

class CommandResponse(BaseModel):
    """Response from a control command"""
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

# ============================================================================
# FIREWALL CONTROL HELPERS
# ============================================================================

class FirewallController:
    """Interface to the firewall_control C program"""
    
    def __init__(self, control_bin: str = "./firewall_control"):
        self.control_bin = control_bin
        self.base_path = Path(__file__).parent.parent.parent
        self.full_path = self.base_path / "firewall_control"
    
    def _run_command(self, *args, sudo: bool = False) -> tuple[bool, str]:
        """
        Execute a firewall control command
        Returns: (success, output)
        """
        try:
            cmd = [str(self.full_path)] + list(args)
            if sudo:
                cmd = ["sudo"] + cmd
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=5
            )
            
            success = result.returncode == 0
            output = result.stdout + result.stderr
            
            logger.info(f"Command: {' '.join(cmd)} -> {result.returncode}")
            return success, output
        
        except subprocess.TimeoutExpired:
            logger.error(f"Command timeout: {' '.join(cmd)}")
            return False, "Command timeout"
        except Exception as e:
            logger.error(f"Command failed: {str(e)}")
            return False, str(e)
    
    def list_connections(self) -> List[Connection]:
        """List active TCP connections"""
        success, output = self._run_command("list_connections", sudo=True)
        
        if not success:
            logger.warning(f"Failed to list connections: {output}")
            return []
        
        connections = []
        # Parse dmesg output - look for connection logs
        dmesg_cmd = "sudo dmesg | grep -i 'connection' | tail -50"
        try:
            result = subprocess.run(dmesg_cmd, shell=True, capture_output=True, text=True)
            
            # Parse connection entries (adjust regex based on actual dmesg format)
            for line in result.stdout.split('\n'):
                if 'New connection' in line or 'ESTABLISHED' in line:
                    # Example: "[FIREWALL] New connection: 192.168.1.100:1234 -> 192.168.1.200:80 [SYN_SENT]"
                    match = re.search(
                        r'(\d+\.\d+\.\d+\.\d+):(\d+)\s*->\s*(\d+\.\d+\.\d+\.\d+):(\d+)\s*\[(\w+)\]',
                        line
                    )
                    if match:
                        src_ip, src_port, dst_ip, dst_port, state = match.groups()
                        # Avoid duplicates
                        conn = Connection(
                            src_ip=src_ip,
                            src_port=int(src_port),
                            dst_ip=dst_ip,
                            dst_port=int(dst_port),
                            state=state,
                            packets=0,
                            bytes=0
                        )
                        if not any(c.src_ip == src_ip and c.src_port == int(src_port) 
                                  and c.dst_ip == dst_ip and c.dst_port == int(dst_port) 
                                  for c in connections):
                            connections.append(conn)
        except Exception as e:
            logger.error(f"Error parsing connections: {str(e)}")
        
        return connections
    
    def add_blacklist(self, ip: str, port: int = 0) -> tuple[bool, str]:
        """Add IP/port to blacklist"""
        if port == 0:
            success, output = self._run_command("add_blacklist", ip, sudo=True)
        else:
            success, output = self._run_command("add_blacklist", ip, str(port), sudo=True)
        
        return success, output
    
    def remove_blacklist(self, ip: str, port: int = 0) -> tuple[bool, str]:
        """Remove IP/port from blacklist"""
        if port == 0:
            success, output = self._run_command("remove_blacklist", ip, sudo=True)
        else:
            success, output = self._run_command("remove_blacklist", ip, str(port), sudo=True)
        
        return success, output
    
    def get_module_status(self) -> Dict[str, Any]:
        """Check if firewall module is loaded"""
        try:
            result = subprocess.run(
                "lsmod | grep firewall",
                shell=True,
                capture_output=True,
                text=True
            )
            
            loaded = result.returncode == 0
            
            return {
                "loaded": loaded,
                "status": "Loaded" if loaded else "Not loaded",
                "message": result.stdout if loaded else "Module not found"
            }
        except Exception as e:
            return {
                "loaded": False,
                "status": "Unknown",
                "message": str(e)
            }
    
    def get_kernel_logs(self, lines: int = 100) -> List[KernelLog]:
        """Get recent kernel logs from dmesg"""
        logs = []
        try:
            result = subprocess.run(
                f"sudo dmesg | tail -{lines}",
                shell=True,
                capture_output=True,
                text=True
            )
            
            for line in result.stdout.split('\n'):
                if not line.strip():
                    continue
                
                # Parse dmesg format: [timestamp] level: message
                level = "INFO"
                message = line
                
                if "[FIREWALL]" in line:
                    level = "INFO"
                if "[FIREWALL-NETLINK]" in line:
                    level = "INFO"
                if "[FIREWALL-DPI]" in line:
                    level = "WARNING"
                if "DROPPING" in line or "DROP" in line:
                    level = "WARNING"
                if "ERROR" in line or "error" in line:
                    level = "ERROR"
                
                logs.append(KernelLog(
                    timestamp=datetime.now().isoformat(),
                    level=level,
                    message=message
                ))
        
        except Exception as e:
            logger.error(f"Error getting kernel logs: {str(e)}")
        
        return logs

# Initialize controller
controller = FirewallController()

# ============================================================================
# API ENDPOINTS - HEALTH & STATUS
# ============================================================================

@app.get("/api/health", tags=["Health"])
async def health_check():
    """Health check endpoint"""
    module_status = controller.get_module_status()
    return {
        "status": "healthy",
        "firewall_module": module_status["status"],
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/status", tags=["Status"], response_model=Dict[str, Any])
async def get_firewall_status():
    """Get overall firewall status"""
    module_status = controller.get_module_status()
    connections = controller.list_connections()
    
    # Get statistics from kernel logs
    logs = controller.get_kernel_logs(200)
    dpi_alerts = sum(1 for log in logs if "DPI" in log.message)
    
    return {
        "module_status": module_status["status"],
        "module_loaded": module_status["loaded"],
        "total_connections": len(connections),
        "active_connections": sum(1 for c in connections if c.state == "ESTABLISHED"),
        "dpi_alerts_recent": dpi_alerts,
        "timestamp": datetime.now().isoformat()
    }

# ============================================================================
# API ENDPOINTS - CONNECTIONS
# ============================================================================

@app.get("/api/connections", tags=["Connections"], response_model=List[Connection])
async def get_connections():
    """Get list of active TCP connections"""
    try:
        connections = controller.list_connections()
        return connections
    except Exception as e:
        logger.error(f"Error fetching connections: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/statistics", tags=["Statistics"], response_model=Statistics)
async def get_statistics():
    """Get firewall statistics"""
    try:
        connections = controller.list_connections()
        logs = controller.get_kernel_logs(200)
        
        # Count blocked IPs from logs
        blocked_ips = len(set(
            re.search(r'(\d+\.\d+\.\d+\.\d+)', log.message).group(1)
            for log in logs if "blacklist" in log.message.lower() and re.search(r'(\d+\.\d+\.\d+\.\d+)', log.message)
        ))
        
        dpi_alerts = sum(1 for log in logs if "DPI" in log.message or "ALERT" in log.message)
        
        return Statistics(
            total_connections=len(connections),
            blocked_ips=blocked_ips,
            active_connections=sum(1 for c in connections if c.state == "ESTABLISHED"),
            packets_processed=sum(c.packets for c in connections),
            dpi_alerts=dpi_alerts,
            mirror_active=True,
            module_status="Active" if controller.get_module_status()["loaded"] else "Inactive",
            uptime_seconds=0  # Would need to track this separately
        )
    except Exception as e:
        logger.error(f"Error fetching statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# API ENDPOINTS - BLACKLIST MANAGEMENT
# ============================================================================

@app.post("/api/blacklist/add", tags=["Blacklist"], response_model=CommandResponse)
async def add_to_blacklist(entry: BlacklistEntry):
    """Add IP/port to blacklist"""
    try:
        # Validate IP format
        if not re.match(r'^\d+\.\d+\.\d+\.\d+$', entry.ip):
            raise HTTPException(status_code=400, detail="Invalid IP format")
        
        if entry.port < 0 or entry.port > 65535:
            raise HTTPException(status_code=400, detail="Invalid port number")
        
        success, output = controller.add_blacklist(entry.ip, entry.port)
        
        if success:
            logger.info(f"Added to blacklist: {entry.ip}:{entry.port}")
            return CommandResponse(
                success=True,
                message=f"Successfully added {entry.ip}:{entry.port} to blacklist"
            )
        else:
            logger.warning(f"Failed to add to blacklist: {output}")
            return CommandResponse(
                success=False,
                message=f"Failed to add to blacklist: {output}"
            )
    except Exception as e:
        logger.error(f"Error adding to blacklist: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/blacklist/remove", tags=["Blacklist"], response_model=CommandResponse)
async def remove_from_blacklist(entry: BlacklistEntry):
    """Remove IP/port from blacklist"""
    try:
        # Validate IP format
        if not re.match(r'^\d+\.\d+\.\d+\.\d+$', entry.ip):
            raise HTTPException(status_code=400, detail="Invalid IP format")
        
        success, output = controller.remove_blacklist(entry.ip, entry.port)
        
        if success:
            logger.info(f"Removed from blacklist: {entry.ip}:{entry.port}")
            return CommandResponse(
                success=True,
                message=f"Successfully removed {entry.ip}:{entry.port} from blacklist"
            )
        else:
            logger.warning(f"Failed to remove from blacklist: {output}")
            return CommandResponse(
                success=False,
                message=f"Failed to remove from blacklist: {output}"
            )
    except Exception as e:
        logger.error(f"Error removing from blacklist: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# API ENDPOINTS - KERNEL LOGS & ALERTS
# ============================================================================

@app.get("/api/logs", tags=["Logs"], response_model=List[KernelLog])
async def get_logs(lines: int = 50):
    """Get recent kernel logs"""
    try:
        if lines < 1 or lines > 500:
            lines = 50
        
        logs = controller.get_kernel_logs(lines)
        return logs
    except Exception as e:
        logger.error(f"Error fetching logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/alerts", tags=["Alerts"], response_model=List[Alert])
async def get_alerts(limit: int = 20):
    """Get security alerts"""
    try:
        alerts = []
        logs = controller.get_kernel_logs(200)
        
        for log in logs[:limit]:
            alert_type = "info"
            severity = "info"
            
            if "DPI" in log.message or "malware" in log.message.lower():
                alert_type = "dpi"
                severity = "critical"
            elif "blacklist" in log.message.lower():
                alert_type = "blacklist"
                severity = "warning"
            elif "DROP" in log.message or "DROPPING" in log.message:
                severity = "warning"
            
            # Extract IPs if possible
            ips = re.findall(r'\d+\.\d+\.\d+\.\d+', log.message)
            src = ips[0] if len(ips) > 0 else "unknown"
            dst = ips[1] if len(ips) > 1 else "unknown"
            
            alerts.append(Alert(
                timestamp=log.timestamp,
                type=alert_type,
                source=src,
                destination=dst,
                message=log.message,
                severity=severity
            ))
        
        return alerts
    except Exception as e:
        logger.error(f"Error fetching alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# API ENDPOINTS - MODULE CONTROL
# ============================================================================

@app.post("/api/module/status", tags=["Module"], response_model=CommandResponse)
async def check_module_status():
    """Check firewall module status"""
    try:
        status = controller.get_module_status()
        return CommandResponse(
            success=status["loaded"],
            message=status["message"],
            data=status
        )
    except Exception as e:
        logger.error(f"Error checking module status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/module/load", tags=["Module"], response_model=CommandResponse)
async def load_module():
    """Load the firewall kernel module (insmod)"""
    try:
        ko_path = controller.base_path / "firewall.ko"
        if not ko_path.exists():
            return CommandResponse(success=False, message=f"firewall.ko not found at {ko_path}")

        result = subprocess.run(
            ["sudo", "insmod", str(ko_path)],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            logger.info("Firewall module loaded")
            return CommandResponse(success=True, message="Firewall module loaded successfully")
        else:
            err = (result.stderr or result.stdout).strip()
            # Already loaded is OK
            if "File exists" in err:
                return CommandResponse(success=True, message="Module already loaded")
            return CommandResponse(success=False, message=f"insmod failed: {err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/module/unload", tags=["Module"], response_model=CommandResponse)
async def unload_module():
    """Unload the firewall kernel module (rmmod)"""
    try:
        result = subprocess.run(
            ["sudo", "rmmod", "firewall"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            logger.info("Firewall module unloaded")
            return CommandResponse(success=True, message="Firewall module unloaded")
        else:
            err = (result.stderr or result.stdout).strip()
            if "not currently loaded" in err or "No such file" in err:
                return CommandResponse(success=True, message="Module was not loaded")
            return CommandResponse(success=False, message=f"rmmod failed: {err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/mirror/toggle", tags=["Module"], response_model=CommandResponse)
async def toggle_mirror(enable: bool = True):
    """Enable or disable packet mirroring via firewall_control"""
    try:
        cmd = "enable_mirror" if enable else "disable_mirror"
        success, output = controller._run_command(cmd, sudo=True)
        action = "enabled" if enable else "disabled"
        if success:
            return CommandResponse(success=True, message=f"Packet mirroring {action}")
        return CommandResponse(success=False, message=output.strip())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    # Run the FastAPI server
    # For production, use: gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
