using Domain;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Infrastructure.Data
{
    public interface IMongoRepository<T> : IRepository<T> where T : BaseDataObject
    {
        // MongoDB-specific method
        Task PatchAsync(System.Guid id, object updates);
    }
}