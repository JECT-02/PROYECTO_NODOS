// ============================================
// GameDev Academy 3D - Aplicacion Principal
// ============================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LLMClient } from './llm-client.js';
import { tutorData } from './data.js';

const CONFIG = {
    camera: { fov: 60, near: 0.1, far: 1000, initialPos: [0, 25, 70] },
    colors: {
        matematicas: 0x00e5ff,
        historia: 0xff6e40,
        ciencias: 0xea80fc,
        lenguaje: 0x76ff03,
        default: 0xffffff,
        connection: 0x667eea,
        background: 0x080c1a
    }
};

class GameDevAcademyApp {
    constructor() {
        this.apiKey = null;
        this.llm = null;
        this.currentTutor = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.nodes = [];
        this.connections = [];
        this.showAllConnections = false;
        this.hoveredNode = null;
        this.selectedNode = null;
        this.animationTime = 0;
        this.init();
    }

    init() {
        this.showApiKeyModal();
        this.setupScene();
        this.loadData();
        this.setupInteraction();
        this.setupUI();
        this.buildLearningPath();
        this.animate();
        window.addEventListener('resize', () => this.onResize());
    }

    showApiKeyModal() {
        const modal = document.getElementById('api-key-modal');
        const saveBtn = document.getElementById('btn-save-key');
        const skipBtn = document.getElementById('btn-skip-key');
        const input = document.getElementById('api-key-input');

        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) {
            this.apiKey = savedKey;
            this.llm = new LLMClient(this.apiKey);
            modal.classList.add('hidden');
            return;
        }

        modal.classList.remove('hidden');

        saveBtn.addEventListener('click', () => {
            const key = input.value.trim();
            if (key) {
                this.apiKey = key;
                this.llm = new LLMClient(this.apiKey);
                localStorage.setItem('gemini_api_key', key);
                modal.classList.add('hidden');
            } else {
                input.style.borderColor = '#ff4081';
            }
        });

        skipBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            this.llm = null;
        });
    }

    // ============================================
    // ESCENA THREE.JS
    // ============================================
    setupScene() {
        const container = document.getElementById('canvas-container');
        const w = container.clientWidth;
        const h = container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.colors.background);
        this.scene.fog = new THREE.FogExp2(CONFIG.colors.background, 0.006);

        this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, w / h, CONFIG.camera.near, CONFIG.camera.far);
        this.camera.position.set(...CONFIG.camera.initialPos);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(CONFIG.colors.background);
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 10;
        this.controls.maxDistance = 200;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.3;

        this.setupLighting();
        this.createStarfield();
        this.createCircleGuide();
    }

    setupLighting() {
        this.scene.add(new THREE.AmbientLight(0x404060, 0.5));
        const main = new THREE.DirectionalLight(0xffffff, 0.8);
        main.position.set(50, 50, 50);
        this.scene.add(main);
        const fill = new THREE.DirectionalLight(0x4444aa, 0.3);
        fill.position.set(-50, 20, -50);
        this.scene.add(fill);
        const pt = new THREE.PointLight(0xffffff, 0.5, 150);
        pt.position.set(0, 10, 0);
        this.scene.add(pt);
    }

    createStarfield() {
        const geo = new THREE.BufferGeometry();
        const count = 2000;
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            pos[i3] = (Math.random() - 0.5) * 600;
            pos[i3 + 1] = (Math.random() - 0.5) * 600;
            pos[i3 + 2] = (Math.random() - 0.5) * 600;
            const t = Math.random();
            if (t < 0.7) { col[i3] = 0.85; col[i3+1] = 0.85; col[i3+2] = 1.0; }
            else if (t < 0.9) { col[i3] = 1.0; col[i3+1] = 0.85; col[i3+2] = 0.6; }
            else { col[i3] = 0.6; col[i3+1] = 1.0; col[i3+2] = 0.7; }
        }
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const mat = new THREE.PointsMaterial({ size: 0.5, vertexColors: true, transparent: true, opacity: 0.7, sizeAttenuation: true });
        this.scene.add(new THREE.Points(geo, mat));
    }

    createCircleGuide() {
        const points = [];
        const segments = 120;
        const radius = 25;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle)));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0x222244, transparent: true, opacity: 0.3 });
        this.scene.add(new THREE.Line(geo, mat));
    }

    // ============================================
    // COORDENADAS Y NODOS
    // ============================================
    tutorToPosition(orden, categoria) {
        const angle = ((orden - 1) / 10) * Math.PI * 2 - Math.PI / 2;
        const radius = 25;
        const catOffsets = { matematicas: 0, historia: 4, ciencias: -4, lenguaje: 8 };
        const yOffset = catOffsets[categoria] || 0;
        return new THREE.Vector3(radius * Math.cos(angle), yOffset, radius * Math.sin(angle));
    }

    getCategoryColor(cat) {
        return CONFIG.colors[cat] || CONFIG.colors.default;
    }

    loadData() {
        tutorData.tutors.forEach(t => this.createNode(t));
        this.createConnections();
    }

    createNode(tutor) {
        const position = this.tutorToPosition(tutor.orden, tutor.categoria);
        const baseRadius = 0.5 + tutor.importancia * 0.1;
        const color = this.getCategoryColor(tutor.categoria);

        const geo = new THREE.SphereGeometry(baseRadius, 32, 32);
        const mat = new THREE.MeshPhongMaterial({
            color, emissive: color, emissiveIntensity: 0.5,
            transparent: true, opacity: 0.95, shininess: 100
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        mesh.userData = { ...tutor, baseRadius, originalColor: color };
        this.scene.add(mesh);
        this.nodes.push(mesh);

        // Glow
        const glowGeo = new THREE.SphereGeometry(baseRadius * 2.2, 32, 32);
        const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08 });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.name = 'glow';
        mesh.add(glow);

        // Ring
        const ringGeo = new THREE.RingGeometry(baseRadius * 1.3, baseRadius * 1.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.name = 'ring';
        ring.rotation.x = Math.PI / 2;
        mesh.add(ring);

        // Label
        this.createLabel(mesh, tutor.nombre, tutor.rol);
        return mesh;
    }

    createLabel(parentMesh, name, role) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 72;

        ctx.fillStyle = 'rgba(8, 12, 26, 0.7)';
        ctx.beginPath();
        ctx.roundRect(0, 0, 256, 72, 10);
        ctx.fill();

        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#f0f2f5';
        ctx.textAlign = 'center';
        ctx.fillText(name, 128, 30);

        ctx.font = '13px Arial';
        ctx.fillStyle = '#a0a8c0';
        ctx.fillText(role.length > 30 ? role.substring(0, 28) + '...' : role, 128, 54);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.9 });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(9, 2.5, 1);
        sprite.position.y = parentMesh.userData.baseRadius * 3 + 1.5;
        sprite.name = 'label';
        parentMesh.add(sprite);
    }

    // ============================================
    // CONEXIONES
    // ============================================
    createConnections() {
        this.nodes.forEach(src => {
            const d = src.userData;
            if (!d.conexiones || d.conexiones.length === 0) return;
            d.conexiones.forEach(targetId => {
                const tgt = this.nodes.find(n => n.userData.id === targetId);
                if (!tgt) return;
                this.createConnectionCurve(src, tgt);
            });
        });
    }

    createConnectionCurve(a, b) {
        const start = a.position.clone();
        const end = b.position.clone();
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        mid.y += 8;

        const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
        const pts = curve.getPoints(60);
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: CONFIG.colors.connection, transparent: true, opacity: 0.0 });
        const line = new THREE.Line(geo, mat);
        line.name = 'connection';
        this.scene.add(line);
        this.connections.push({ source: a, target: b, mesh: line, curve });
    }

    updateConnectionsVisibility() {
        this.connections.forEach(c => {
            if (this.showAllConnections) { c.mesh.material.opacity = 0.4; return; }
            const d1 = this.camera.position.distanceTo(c.source.position);
            const d2 = this.camera.position.distanceTo(c.target.position);
            const mn = Math.min(d1, d2);
            c.mesh.material.opacity = mn < 35 ? Math.min(0.6, (35 - mn) / 25) : 0.0;
        });
    }

    // ============================================
    // INTERACCION
    // ============================================
    setupInteraction() {
        const cv = this.renderer.domElement;
        cv.addEventListener('mousemove', e => this.onMouseMove(e));
        cv.addEventListener('click', e => this.onClick(e));
        cv.addEventListener('mousedown', () => { this.controls.autoRotate = false; });
    }

    onMouseMove(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.nodes);
        const tooltip = document.getElementById('tooltip');

        if (intersects.length > 0) {
            const node = intersects[0].object;
            const d = node.userData;
            if (this.hoveredNode !== node) {
                this.unhoverNode();
                this.hoverNode(node);
                this.hoveredNode = node;
            }
            tooltip.classList.remove('hidden');
            tooltip.innerHTML = `
                <div class="tooltip-name">${d.nombre}</div>
                <div class="tooltip-role">${d.rol}</div>
                <div class="tooltip-summary">${d.resumen.substring(0, 120)}...</div>
            `;
            tooltip.style.left = (event.clientX + 15) + 'px';
            tooltip.style.top = (event.clientY + 15) + 'px';
            this.renderer.domElement.style.cursor = 'pointer';
        } else {
            this.unhoverNode();
            this.hoveredNode = null;
            tooltip.classList.add('hidden');
            this.renderer.domElement.style.cursor = 'default';
        }
    }

    hoverNode(node) {
        node.scale.setScalar(1.4);
        node.material.emissiveIntensity = 0.9;
        const glow = node.getObjectByName('glow');
        if (glow) glow.material.opacity = 0.25;
        const ring = node.getObjectByName('ring');
        if (ring) ring.material.opacity = 0.5;
        this.triggerHaptic(node.userData.hapticPattern?.pattern);
    }

    unhoverNode() {
        if (!this.hoveredNode) return;
        this.hoveredNode.scale.setScalar(1);
        this.hoveredNode.material.emissiveIntensity = 0.5;
        const glow = this.hoveredNode.getObjectByName('glow');
        if (glow) glow.material.opacity = 0.08;
        const ring = this.hoveredNode.getObjectByName('ring');
        if (ring) { ring.material.opacity = 0.2; ring.rotation.x = Math.PI / 2; }
    }

    onClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const m = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );
        this.raycaster.setFromCamera(m, this.camera);
        const intersects = this.raycaster.intersectObjects(this.nodes);
        if (intersects.length > 0) this.selectNode(intersects[0].object);
        else this.deselectNode();
    }

    selectNode(node) {
        this.selectedNode = node;
        const d = node.userData;
        const panel = document.getElementById('info-panel');
        panel.classList.remove('hidden');

        document.getElementById('info-title').textContent = d.nombre;
        document.getElementById('info-role').textContent = d.rol;
        document.getElementById('info-summary').textContent = d.resumen;

        const catEl = document.getElementById('info-category');
        const colorHex = '#' + this.getCategoryColor(d.categoria).toString(16).padStart(6, '0');
        catEl.textContent = d.categoria.replace('_', ' ').toUpperCase();
        catEl.style.background = colorHex + '22';
        catEl.style.color = colorHex;

        const hapticEl = document.getElementById('info-haptic-text');
        hapticEl.textContent = d.hapticPattern?.description || '';

        const topicsEl = document.getElementById('info-topics');
        topicsEl.innerHTML = '';
        if (d.metadata?.temas) {
            d.metadata.temas.forEach(t => {
                const tag = document.createElement('span');
                tag.className = 'topic-tag';
                tag.textContent = t;
                topicsEl.appendChild(tag);
            });
        }

        const chatBtn = document.getElementById('btn-chat');
        chatBtn.style.display = d.prompt_personaje ? 'block' : 'none';
        chatBtn.onclick = () => this.openChat(d);

        this.focusCameraOnNode(node);
    }

    deselectNode() {
        this.selectedNode = null;
        document.getElementById('info-panel').classList.add('hidden');
    }

    focusCameraOnNode(node) {
        const targetPos = node.position.clone();
        targetPos.y += 15;
        targetPos.z += 25;
        const startPos = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        let progress = 0;

        const animateCamera = () => {
            progress += 0.03;
            if (progress >= 1) { this.controls.target.copy(node.position); return; }
            const ease = 1 - Math.pow(1 - progress, 3);
            this.camera.position.lerpVectors(startPos, targetPos, ease);
            this.controls.target.lerpVectors(startTarget, node.position, ease);
            requestAnimationFrame(animateCamera);
        };
        animateCamera();
    }

    // ============================================
    // UI
    // ============================================
    setupUI() {
        document.getElementById('btn-connections').addEventListener('click', e => {
            this.showAllConnections = !this.showAllConnections;
            e.currentTarget.classList.toggle('active');
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            this.camera.position.set(...CONFIG.camera.initialPos);
            this.controls.target.set(0, 0, 0);
            this.controls.autoRotate = true;
            this.deselectNode();
        });

        document.getElementById('btn-learning-path').addEventListener('click', () => {
            document.getElementById('learning-path-panel').classList.toggle('hidden');
        });

        document.getElementById('filter-category').addEventListener('change', e => {
            this.filterByCategory(e.target.value);
        });

        document.getElementById('search-node').addEventListener('input', e => {
            this.searchNodes(e.target.value);
        });

        document.getElementById('info-close').addEventListener('click', () => this.deselectNode());

        document.getElementById('chat-close').addEventListener('click', () => {
            document.getElementById('chat-panel').classList.add('hidden');
            this.currentTutor = null;
        });

        document.getElementById('learning-path-close').addEventListener('click', () => {
            document.getElementById('learning-path-panel').classList.add('hidden');
        });

        document.getElementById('chat-send').addEventListener('click', () => this.sendChatMessage());

        document.getElementById('chat-input').addEventListener('keypress', e => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        document.getElementById('btn-haptic').addEventListener('click', () => {
            if (this.currentTutor?.hapticPattern?.pattern) {
                this.triggerHaptic(this.currentTutor.hapticPattern.pattern);
            }
        });
    }

    filterByCategory(category) {
        this.nodes.forEach(node => {
            const match = category === 'all' || node.userData.categoria === category;
            node.visible = match;
            ['glow', 'ring', 'label'].forEach(name => {
                const child = node.getObjectByName(name);
                if (child) child.visible = match;
            });
        });
    }

    searchNodes(query) {
        if (!query.trim()) {
            this.filterByCategory(document.getElementById('filter-category').value);
            return;
        }
        const q = query.toLowerCase();
        this.nodes.forEach(node => {
            const d = node.userData;
            const match = d.nombre.toLowerCase().includes(q) || d.rol.toLowerCase().includes(q) || d.especialidad.toLowerCase().includes(q);
            node.visible = match;
            ['glow', 'ring', 'label'].forEach(name => {
                const child = node.getObjectByName(name);
                if (child) child.visible = match;
            });
        });
    }

    buildLearningPath() {
        const list = document.getElementById('learning-path-list');
        list.innerHTML = '';
        const sorted = [...tutorData.tutors].sort((a, b) => a.orden - b.orden);

        sorted.forEach((tutor, i) => {
            if (i > 0) {
                const connector = document.createElement('div');
                connector.className = 'lp-connector';
                list.appendChild(connector);
            }
            const item = document.createElement('div');
            item.className = 'lp-item';
            const colorHex = '#' + this.getCategoryColor(tutor.categoria).toString(16).padStart(6, '0');
            item.innerHTML = `
                <span class="lp-number" style="background:${colorHex}22;color:${colorHex}">${tutor.orden}</span>
                <div class="lp-info">
                    <div class="lp-name">${tutor.nombre}</div>
                    <div class="lp-role">${tutor.rol}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                const node = this.nodes.find(n => n.userData.id === tutor.id);
                if (node) this.selectNode(node);
            });
            list.appendChild(item);
        });
    }

    // ============================================
    // CHAT
    // ============================================
    openChat(tutorInfo) {
        this.currentTutor = tutorInfo;
        if (this.llm) this.llm.clearHistory();

        const chatPanel = document.getElementById('chat-panel');
        const avatarEmoji = document.getElementById('chat-avatar-emoji');
        const nameEl = document.getElementById('chat-name');
        const messages = document.getElementById('chat-messages');

        avatarEmoji.textContent = tutorInfo.nombre.charAt(0).toUpperCase();
        nameEl.textContent = `${tutorInfo.nombre} - ${tutorInfo.rol}`;
        messages.innerHTML = '';

        this.addMessage('system', `Conversando con ${tutorInfo.nombre}. ${tutorInfo.resumen}`);
        chatPanel.classList.remove('hidden');
        this.triggerHaptic(tutorInfo.hapticPattern?.pattern);

        if (!this.llm || !this.apiKey) {
            this.addMessage('character', `Hola, soy ${tutorInfo.nombre}, ${tutorInfo.rol}. ${tutorInfo.resumen}\n\nMis temas principales: ${tutorInfo.metadata?.temas?.join(', ') || 'Varios'}.\n\nPara tener una conversacion interactiva conmigo, configura tu API key de Gemini recargando la pagina.`);
            return;
        }

        this.addMessage('loading', 'Preparando al tutor...');
        this.llm.chatOneShot(
            "Presentate brevemente (maximo 2 oraciones) como tutor de esta materia y propone un mini-ejercicio introductorio.",
            tutorInfo.prompt_personaje, 0.7
        ).then(response => {
            this.removeLoading();
            this.addMessageWithEffect('character', response, tutorInfo.id === 'story');
        }).catch(err => {
            this.removeLoading();
            this.addMessage('error', `Error: ${err.message}`);
        });
    }

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text || !this.currentTutor) return;

        this.addMessage('user', text);
        input.value = '';

        if (!this.llm || !this.apiKey) {
            this.addMessage('character', 'Para respuestas interactivas, configura tu API key de Gemini recargando la pagina.');
            return;
        }

        this.addMessage('loading', 'Escribiendo...');

        try {
            const response = await this.llm.chat(text, this.currentTutor.prompt_personaje);
            this.removeLoading();
            this.addMessageWithEffect('character', response, this.currentTutor.id === 'story');
            this.triggerHaptic(this.currentTutor.hapticPattern?.pattern);
        } catch (error) {
            this.removeLoading();
            this.addMessage('error', `Error: ${error.message}. Verifica tu conexion y API key.`);
        }
    }

    removeLoading() {
        const loading = document.querySelector('#chat-messages .loading');
        if (loading) loading.remove();
    }

    addMessage(type, text) {
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = `message ${type}`;
        if (type === 'system') div.innerHTML = text;
        else div.textContent = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    addMessageWithEffect(type, text, useTypewriter) {
        if (useTypewriter && text.length < 500) {
            const container = document.getElementById('chat-messages');
            const div = document.createElement('div');
            div.className = `message ${type} typewriter`;
            div.textContent = '';
            container.appendChild(div);
            container.scrollTop = container.scrollHeight;

            let i = 0;
            const interval = setInterval(() => {
                div.textContent += text.charAt(i);
                i++;
                container.scrollTop = container.scrollHeight;
                if (i >= text.length) {
                    clearInterval(interval);
                    div.classList.remove('typewriter');
                }
            }, 25);
        } else {
            this.addMessage(type, text);
        }
    }

    // ============================================
    // HAPTICO
    // ============================================
    triggerHaptic(pattern) {
        if (pattern && navigator.vibrate) {
            try { navigator.vibrate(pattern); } catch (e) { /* no soportado */ }
        }
    }

    // ============================================
    // ANIMACION
    // ============================================
    animate() {
        requestAnimationFrame(() => this.animate());
        this.animationTime = performance.now() * 0.001;
        this.updateConnectionsVisibility();

        this.nodes.forEach((node, i) => {
            const pulse = Math.sin(this.animationTime * 2 + i * 0.6) * 0.05 + 1;
            const ring = node.getObjectByName('ring');
            if (ring) { ring.scale.setScalar(pulse); ring.rotation.z += 0.005; }
            const glow = node.getObjectByName('glow');
            if (glow) {
                const gp = Math.sin(this.animationTime * 1.5 + i * 0.3) * 0.02 + 1;
                glow.scale.setScalar(gp);
            }
        });

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const c = document.getElementById('canvas-container');
        const w = c.clientWidth;
        const h = c.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
}

document.addEventListener('DOMContentLoaded', () => { new GameDevAcademyApp(); });
