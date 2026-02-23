class NodoPropietario:
    def __init__(self, data):
        self.data = data
        self.next = None


class ListaPropietarios:
    def __init__(self):
        self.head = None
        self.tail = None
        self.length = 0

    def insertar(self, data):
        nodo = NodoPropietario(data)
        if not self.head:
            self.head = nodo
            self.tail = nodo
        else:
            self.tail.next = nodo
            self.tail = nodo
        self.length += 1

    def eliminar_por_id(self, id_):
        if not self.head:
            return False

        if self.head.data.get("id") == id_:
            self.head = self.head.next
            if not self.head:
                self.tail = None
            self.length -= 1
            return True

        prev = self.head
        curr = self.head.next
        while curr:
            if curr.data.get("id") == id_:
                prev.next = curr.next
                if curr == self.tail:
                    self.tail = prev
                self.length -= 1
                return True
            prev = curr
            curr = curr.next
        return False

    def recorrer(self, callback):
        curr = self.head
        while curr:
            callback(curr.data)
            curr = curr.next

    def to_list(self):
        data = []
        self.recorrer(lambda item: data.append(item))
        return data


class NodoPropietarioBST:
    def __init__(self, key, data):
        self.key = key
        self.data = data
        self.left = None
        self.right = None


class ArbolPropietariosBST:
    def __init__(self):
        self.root = None
        self.size = 0

    def insertar(self, key, data):
        nuevo = NodoPropietarioBST(key, data)
        if not self.root:
            self.root = nuevo
            self.size += 1
            return

        curr = self.root
        while True:
            if key < curr.key:
                if not curr.left:
                    curr.left = nuevo
                    self.size += 1
                    return
                curr = curr.left
            else:
                if not curr.right:
                    curr.right = nuevo
                    self.size += 1
                    return
                curr = curr.right

    def buscar(self, key):
        curr = self.root
        while curr:
            if key == curr.key:
                return curr.data
            curr = curr.left if key < curr.key else curr.right
        return None

    def _inorden(self, node, out):
        if not node:
            return
        self._inorden(node.left, out)
        out.append(node.data)
        self._inorden(node.right, out)

    def inorden(self):
        out = []
        self._inorden(self.root, out)
        return out


class MatrizRecibos:
    def __init__(self):
        self.meses = {}

    def _asegurar_mes(self, mes):
        if mes not in self.meses:
            self.meses[mes] = {}
        return self.meses[mes]

    def set_recibo(self, mes, propietario_id, recibo):
        fila = self._asegurar_mes(mes)
        fila[propietario_id] = recibo

    def get_recibo(self, mes, propietario_id):
        fila = self.meses.get(mes)
        if not fila:
            return None
        return fila.get(propietario_id)

    def total_por_mes(self, mes):
        fila = self.meses.get(mes)
        if not fila:
            return 0
        total = 0
        for recibo in fila.values():
            total += (
                recibo["monto_administracion"]
                + recibo["monto_agua"]
                + recibo["monto_luz"]
                + recibo["monto_mantenimiento"]
            )
        return total

    def total_por_propietario(self, propietario_id):
        total = 0
        for fila in self.meses.values():
            recibo = fila.get(propietario_id)
            if recibo:
                total += (
                    recibo["monto_administracion"]
                    + recibo["monto_agua"]
                    + recibo["monto_luz"]
                    + recibo["monto_mantenimiento"]
                )
        return total

    def listar_por_propietario(self, propietario_id, filtro_fn=None):
        result = []
        for fila in self.meses.values():
            for recibo in fila.values():
                if recibo.get("propietario_id") == propietario_id:
                    if not filtro_fn or filtro_fn(recibo):
                        result.append(recibo)
        return result


class NodoBST:
    def __init__(self, key, value):
        self.key = key
        self.value = value
        self.left = None
        self.right = None


class ArbolRecibosBST:
    def __init__(self):
        self.root = None
        self.size = 0

    def insertar(self, key, value):
        if self.root is None:
            self.root = NodoBST(key, value)
            self.size += 1
            return

        curr = self.root
        while True:
            if key < curr.key:
                if curr.left is None:
                    curr.left = NodoBST(key, value)
                    self.size += 1
                    return
                curr = curr.left
            else:
                if curr.right is None:
                    curr.right = NodoBST(key, value)
                    self.size += 1
                    return
                curr = curr.right

    def _inorden(self, node, out):
        if not node:
            return
        self._inorden(node.left, out)
        out.append(node.value)
        self._inorden(node.right, out)

    def _preorden(self, node, out):
        if not node:
            return
        out.append(node.value)
        self._preorden(node.left, out)
        self._preorden(node.right, out)

    def _postorden(self, node, out):
        if not node:
            return
        self._postorden(node.left, out)
        self._postorden(node.right, out)
        out.append(node.value)

    def recorrer(self, tipo="inorden"):
        out = []
        if tipo == "preorden":
            self._preorden(self.root, out)
        elif tipo == "postorden":
            self._postorden(self.root, out)
        else:
            self._inorden(self.root, out)
        return out

    def _rango(self, node, min_key, max_key, out):
        if not node:
            return
        if node.key >= min_key:
            self._rango(node.left, min_key, max_key, out)
        if min_key <= node.key <= max_key:
            out.append(node.value)
        if node.key <= max_key:
            self._rango(node.right, min_key, max_key, out)

    def rango(self, min_key, max_key):
        out = []
        self._rango(self.root, min_key, max_key, out)
        return out


class NodoAVL:
    def __init__(self, key, value):
        self.key = key
        self.value = value
        self.left = None
        self.right = None
        self.height = 1


class ArbolRecibosAVL:
    def __init__(self):
        self.root = None
        self.size = 0

    def _height(self, node):
        return node.height if node else 0

    def _update_height(self, node):
        node.height = 1 + max(self._height(node.left), self._height(node.right))

    def _balance_factor(self, node):
        return self._height(node.left) - self._height(node.right)

    def _rotate_right(self, y):
        x = y.left
        t2 = x.right
        x.right = y
        y.left = t2
        self._update_height(y)
        self._update_height(x)
        return x

    def _rotate_left(self, x):
        y = x.right
        t2 = y.left
        y.left = x
        x.right = t2
        self._update_height(x)
        self._update_height(y)
        return y

    def _insert(self, node, key, value):
        if node is None:
            self.size += 1
            return NodoAVL(key, value)

        if key < node.key:
            node.left = self._insert(node.left, key, value)
        else:
            node.right = self._insert(node.right, key, value)

        self._update_height(node)
        balance = self._balance_factor(node)

        if balance > 1 and key < node.left.key:
            return self._rotate_right(node)
        if balance < -1 and key > node.right.key:
            return self._rotate_left(node)
        if balance > 1 and key > node.left.key:
            node.left = self._rotate_left(node.left)
            return self._rotate_right(node)
        if balance < -1 and key < node.right.key:
            node.right = self._rotate_right(node.right)
            return self._rotate_left(node)

        return node

    def insertar(self, key, value):
        self.root = self._insert(self.root, key, value)

    def _inorden(self, node, out):
        if not node:
            return
        self._inorden(node.left, out)
        out.append(node.value)
        self._inorden(node.right, out)

    def _preorden(self, node, out):
        if not node:
            return
        out.append(node.value)
        self._preorden(node.left, out)
        self._preorden(node.right, out)

    def _postorden(self, node, out):
        if not node:
            return
        self._postorden(node.left, out)
        self._postorden(node.right, out)
        out.append(node.value)

    def recorrer(self, tipo="inorden"):
        out = []
        if tipo == "preorden":
            self._preorden(self.root, out)
        elif tipo == "postorden":
            self._postorden(self.root, out)
        else:
            self._inorden(self.root, out)
        return out

    def _rango(self, node, min_key, max_key, out):
        if not node:
            return
        if node.key >= min_key:
            self._rango(node.left, min_key, max_key, out)
        if min_key <= node.key <= max_key:
            out.append(node.value)
        if node.key <= max_key:
            self._rango(node.right, min_key, max_key, out)

    def rango(self, min_key, max_key):
        out = []
        self._rango(self.root, min_key, max_key, out)
        return out


class ColaPrioridadMorosos:
    def __init__(self):
        self.heap = []

    def _priority(self, item):
        # Mayor saldo y mayor antiguedad primero.
        return item["saldo"], item["dias_pendiente"]

    def _swap(self, i, j):
        self.heap[i], self.heap[j] = self.heap[j], self.heap[i]

    def _heapify_up(self, idx):
        while idx > 0:
            parent = (idx - 1) // 2
            if self._priority(self.heap[idx]) <= self._priority(self.heap[parent]):
                break
            self._swap(idx, parent)
            idx = parent

    def _heapify_down(self, idx):
        n = len(self.heap)
        while True:
            left = 2 * idx + 1
            right = 2 * idx + 2
            largest = idx

            if left < n and self._priority(self.heap[left]) > self._priority(self.heap[largest]):
                largest = left
            if right < n and self._priority(self.heap[right]) > self._priority(self.heap[largest]):
                largest = right
            if largest == idx:
                break
            self._swap(idx, largest)
            idx = largest

    def enqueue(self, item):
        self.heap.append(item)
        self._heapify_up(len(self.heap) - 1)

    def dequeue(self):
        if not self.heap:
            return None
        if len(self.heap) == 1:
            return self.heap.pop()

        top = self.heap[0]
        self.heap[0] = self.heap.pop()
        self._heapify_down(0)
        return top

    def to_sorted_list(self, limit=None):
        backup = list(self.heap)
        out = []
        while self.heap and (limit is None or len(out) < limit):
            out.append(self.dequeue())
        self.heap = backup
        return out
